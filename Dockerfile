# Build stage
FROM node:18-alpine AS build

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy app source
COPY . .

# Production stage
FROM node:18-alpine

# Set environment to production
ENV NODE_ENV=production
ENV TEMPO_URL=http://tempo:4318/v1/traces
ENV LOKI_URL=http://loki:3100

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodeuser

WORKDIR /usr/src/app

# Copy from build stage
COPY --from=build --chown=nodeuser:nodejs /usr/src/app .

# Switch to non-root user
USER nodeuser

# Expose ports (app and metrics)
EXPOSE 3000
EXPOSE 8080

# Start the application with instrumentation
CMD ["node", "-r", "./instrumentation.js", "./bin/www"]