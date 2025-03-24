# Build stage
FROM node:18-alpine AS build

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Production stage
FROM node:18-alpine

# Set environment to production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodeuser

WORKDIR /usr/src/app

# Copy from build stage
COPY --from=build --chown=nodeuser:nodejs /usr/src/app .

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "./bin/www"]