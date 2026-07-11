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

# General-purpose, non-GUI workbench for the in-container agent. Keep this
# explicit: the slim base image intentionally omits even commonplace tools.
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates coreutils findutils grep sed gawk \
    diffutils patch file less procps psmisc util-linux \
    git openssh-client rsync \
    ripgrep fd-find tree jq yq \
    curl wget dnsutils iputils-ping netcat-openbsd \
    tar gzip bzip2 xz-utils zip unzip \
    python3 python3-pip python3-venv \
    build-essential pkg-config sqlite3 shellcheck vim-tiny nano \
    && ln -s /usr/bin/fdfind /usr/local/bin/fd \
    && for command in find fd rg tree jq yq git ssh curl wget tar gzip bzip2 xz zip unzip file diff patch make gcc g++ python3 pip3 sqlite3 rsync ps pgrep ping nc; do \
      command -v "$command" >/dev/null || { echo "missing required agent tool: $command" >&2; exit 1; }; \
    done \
    && rm -rf /var/lib/apt/lists/*

# Production dependencies only (the server's runtime deps; web is static output).
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false && npm cache clean --force

# The Cline SDK can use Claude Code as a subscription-backed inference
# provider. Expose the locked workspace dependency as a normal runtime command
# for `compose-helper.sh claude-auth` and SDK subprocess discovery.
RUN ln -s /app/node_modules/.bin/claude /usr/local/bin/claude

# Built artifacts from the build stage.
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

# The data root lives on a mounted volume; run as the unprivileged node user.
# It holds secrets, so the app refuses to start unless it is private (0700) —
# create it that way so a fresh named volume inherits the mode and ownership.
ENV SECOND_BRAIN_WEB_DATA_DIR=/data \
    SECOND_BRAIN_WEB_HOST=0.0.0.0 \
    SECOND_BRAIN_WEB_PORT=8722 \
    CLAUDE_CONFIG_DIR=/data/claude-code
RUN mkdir -p /data && chown -R node:node /data && chmod 700 /data
VOLUME ["/data"]
EXPOSE 8722
USER node

CMD ["node", "server/dist/index.js"]
