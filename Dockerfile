FROM node:22-slim

WORKDIR /app

# Install build tools for better-sqlite3 native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files and install
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Copy source and build
COPY . .
RUN npm run build

# Build the MCP client package too
WORKDIR /app/packages/slack-mcp-client
RUN npm install && npx tsc

WORKDIR /app

# Prune dev dependencies
RUN npm prune --production

EXPOSE 3000 3001

CMD ["node", "dist/app.js"]
