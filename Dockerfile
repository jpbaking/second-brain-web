# syntax=docker/dockerfile:1
#
# Multi-stage build for second-brain-web (milestone 12). The build stage
# installs every workspace dependency and compiles the server (tsc) and the web
# client (vite); the runtime stage keeps only production dependencies plus the
# built artifacts. The server serves `web/dist` as a sibling of `server/dist`,
# so that relative layout is preserved in the final image.
#
# Node 24: `node:sqlite` (DatabaseSync + FTS5) is stable there without a flag,
# matching how the app opens its core DB and search index.

# ---- build stage -------------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app

# Install dependencies first for better layer caching. Copy every workspace
# manifest so `npm ci` can resolve the workspace tree from the lockfile.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

# Build both workspaces.
COPY server ./server
COPY web ./web
RUN npm run build

# ---- runtime stage -----------------------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only (the server's runtime deps; web is static output).
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --omit=dev && npm cache clean --force

# Built artifacts from the build stage.
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

# The data root lives on a mounted volume; run as the unprivileged node user.
# It holds secrets, so the app refuses to start unless it is private (0700) —
# create it that way so a fresh named volume inherits the mode and ownership.
ENV SECOND_BRAIN_WEB_DATA_DIR=/data \
    SECOND_BRAIN_WEB_HOST=0.0.0.0 \
    SECOND_BRAIN_WEB_PORT=8722
RUN mkdir -p /data && chown -R node:node /data && chmod 700 /data
VOLUME ["/data"]
EXPOSE 8722
USER node

CMD ["node", "server/dist/index.js"]
