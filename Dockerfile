# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY prisma ./prisma
COPY package*.json ./
RUN npm ci

RUN npx prisma generate

COPY src ./src

# Production stage
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/app.js"]
