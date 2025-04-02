const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const winston = require('winston');
const { trace, context } = require('@opentelemetry/api');
const promClient = require('prom-client');
const { v4: uuidv4 } = require('uuid');

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
  ),
  defaultMeta: { service: 'web-app' },
  transports: [
    new winston.transports.Console()
  ]
});

// Add Loki transport in production if LOKI_URL is set
if (process.env.NODE_ENV === 'production' && process.env.LOKI_URL) {
  try {
    const LokiTransport = require('winston-loki');
    logger.add(new LokiTransport({
      host: process.env.LOKI_URL,
      labels: { app: 'web-app' },
      json: true,
      batching: true,
      interval: 5
    }));
    logger.info('Loki transport configured');
  } catch (error) {
    logger.error('Failed to initialize Loki transport', { error: error.message });
  }
}

// Initialize metrics collection
promClient.collectDefaultMetrics();
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
});

// Track active requests count
const activeRequests = new promClient.Gauge({
  name: 'http_active_requests',
  help: 'Number of active HTTP requests',
  labelNames: ['method']
});

// Log application startup
logger.info('Application starting', {
  nodeVersion: process.version,
  env: process.env.NODE_ENV || 'development'
});

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Morgan logging middleware
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) }
}));

// OpenTelemetry correlation middleware
app.use((req, res, next) => {
  try {
    const activeSpan = trace.getSpan(context.active());
    if (activeSpan) {
      const ctx = activeSpan.spanContext();
      req.traceId = ctx.traceId;
      req.spanId = ctx.spanId;
      res.setHeader('X-Trace-ID', ctx.traceId);
    }
  } catch (error) {
    logger.warn('Failed to extract trace context', { error: error.message });
  }

  // Create request-scoped logger
  req.logger = logger.child({
    requestId: req.id,
    traceId: req.traceId,
    spanId: req.spanId
  });

  next();
});

// Request timing and metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  const method = req.method;

  // Increment active requests counter
  activeRequests.inc({ method });

  // Log request start
  req.logger.debug('Request started', {
    method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent']
  });

  // Track response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const route = req.route?.path || req.path;

    // Observe request duration
    httpRequestDurationMicroseconds
        .labels(method, route, statusCode)
        .observe(duration);

    // Decrement active requests counter
    activeRequests.dec({ method });

    // Log with appropriate level based on status code
    const logLevel = statusCode >= 500 ? 'error' :
        statusCode >= 400 ? 'warn' : 'info';

    req.logger[logLevel]('Request completed', {
      method,
      url: req.originalUrl,
      statusCode,
      duration,
      contentType: res.get('Content-Type'),
      contentLength: res.get('Content-Length')
    });
  });

  next();
});

// Regular middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (error) {
    req.logger.error('Failed to generate metrics', { error: error.message });
    res.status(500).send('Error generating metrics');
  }
});

// Application routes
app.use('/', indexRouter);
app.use('/users', usersRouter);

// 404 handler
app.use((req, res, next) => {
  req.logger.warn('Route not found');
  next(createError(404));
});

// Error handler
app.use((err, req, res, next) => {
  // Log error with context
  req.logger.error('Request error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    statusCode: err.status || 500
  });

  // Set locals for rendering
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Render error page
  res.status(err.status || 500);
  res.render('error');
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  // Add any cleanup code here (close DB connections, etc.)
  process.exit(0);
});

module.exports = app;