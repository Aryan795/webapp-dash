# ---- build stage ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
# copy only the two workspaces, never `.` — see .dockerignore for why
COPY server server
COPY web web
RUN npm run build

# ---- runtime stage ----
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Kolkata \
    DATA_DIR=/app/data
RUN apk add --no-cache tzdata && mkdir -p /app/data && chown node:node /app/data
COPY package.json package-lock.json ./
COPY server/package.json server/
# npm resolves every workspace before installing, so web/package.json must exist
COPY web/package.json web/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
COPY --chown=node:node config config
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/healthz" || exit 1
CMD ["node", "server/dist/index.js"]
