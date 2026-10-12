# ---- build: install everything, build the React app ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run typecheck && npm test && npm run build

# ---- runtime: production deps + server source + built frontend ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/data/secretsanta.db PUBLIC_DIR=/app/dist/public
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./server/src
COPY --from=build /app/dist/public ./dist/public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/src/index.ts"]
