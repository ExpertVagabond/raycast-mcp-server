FROM node:18-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies and build
RUN npm ci && npm run build

# Start the application
CMD ["node", "dist/index.js"]