// Load instrumentation first
require('./instrumentation');

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const winston = require('winston');
const LokiTransport = require('winston-loki');
const promClient = require('prom-client');

// Initialize Prometheus client
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// HTTP request duration metric
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});
register.registerMetric(httpRequestDurationMicroseconds);

// Create winston logger with Loki transport
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'node-app' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new LokiTransport({
      host: process.env.LOKI_URL || 'http://loki:3100',
      labels: { job: 'node-app' },
      json: true,
      format: winston.format.json(),
      onConnectionError: (err) => console.error(err)
    })
  ]
});

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Add a metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Add middleware to measure request duration
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDurationMicroseconds
        .labels(req.method, req.route?.path || req.path, res.statusCode)
        .observe(duration);
    logger.info(`${req.method} ${req.url} ${res.statusCode} - ${duration}s`);
  });
  next();
});

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  logger.warn(`404 Not Found: ${req.path}`);
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Log the error
  logger.error(`Error ${err.status || 500}: ${err.message}`);

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;