# --- Build Stage ---
FROM node:22-slim AS builder

# Install OpenSSL (Required for Prisma engines)
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install all dependencies
RUN npm install

# Generate the Prisma Client
# This creates the artifacts in node_modules/.prisma
RUN npx prisma generate

# Copy the rest of the code and build (if using TS)
COPY . .
RUN npm run build

# --- Production Stage ---
FROM node:22-slim AS runner

RUN apt-get update -y && apt-get install -y openssl --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Copy only the necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

# Cloud Run listens on port 8080 by default
EXPOSE 8080

# Use a start script that handles migrations (optional but recommended)
CMD ["node", "dist/index.js"]
