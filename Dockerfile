# ---- build stage ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev -w server
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
COPY config config
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
