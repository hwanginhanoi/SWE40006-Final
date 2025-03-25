const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const winston = require('winston');
const { trace, context } = require('@opentelemetry/api');
const LokiTransport = require('winston-loki');
const { promClient, collectDefaultMetrics } = require('prom-client');

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

// Add Loki transport in production
if (process.env.NODE_ENV === 'production' && process.env.LOKI_URL) {
  logger.add(new LokiTransport({
    host: process.env.LOKI_URL,
    labels: { app: 'web-app' },
    json: true,
    batching: true,
    interval: 5
  }));
  logger.info('Loki transport configured');
}

// Metrics setup
collectDefaultMetrics();
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
});

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Add logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.http(message.trim())
  }
}));

// Add telemetry correlation middleware
app.use((req, res, next) => {
  const activeSpan = trace.getSpan(context.active());
  if (activeSpan) {
    const traceId = activeSpan.spanContext().traceId;
    const spanId = activeSpan.spanContext().spanId;
    req.traceId = traceId;
    req.spanId = spanId;
    res.set('X-Trace-ID', traceId);
  }
  next();
});

// Add request timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    httpRequestDurationMicroseconds
        .labels(req.method, req.route?.path || req.path, res.statusCode)
        .observe(duration);

    logger.info(`${req.method} ${req.originalUrl}`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
      traceId: req.traceId,
      spanId: req.spanId
    });
  });
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    traceId: req.traceId
  });
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // log error details
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    statusCode: err.status || 500,
    method: req.method,
    url: req.originalUrl,
    traceId: req.traceId
  });

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;