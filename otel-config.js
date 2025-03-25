// production-like-otel-config.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

// Use environment variable or default to localhost
const TEMPO_URL = process.env.TEMPO_URL || 'http://localhost:4318/v1/traces';

const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
        url: TEMPO_URL
    }),
    instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();

process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log('Tracing terminated'))
        .catch((error) => console.log('Error terminating tracing', error))
        .finally(() => process.exit(0));
});