FROM node:22-slim

WORKDIR /app

# Install build tools for better-sqlite3 native addon + curl for healthcheck
RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*

# Copy package files and install
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Force-rebuild native addons for this platform (linux/amd64)
RUN npm rebuild better-sqlite3

# Copy source and build
COPY . .
RUN npm run build

# Build the MCP client package
WORKDIR /app/packages/slack-mcp-client
RUN npm install && npx tsc

WORKDIR /app

# Prune dev dependencies (keep native modules intact)
RUN npm prune --omit=dev

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:3000/api/mcp/health || exit 1

CMD ["node", "dist/app.js"]
