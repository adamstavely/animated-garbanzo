# syntax=docker/dockerfile:1.7
#
# Nym API image.
#
# Build from the repository root, not from this directory, because the API is a
# workspace member and needs the root lockfile and packages/shared:
#
#   docker build -f apps/api/Dockerfile -t nym-api:1.0.0 .

# ---- Dependencies ----------------------------------------------------------
# Installed once, from the lockfile only, so this layer is reused whenever the
# manifests are unchanged.
FROM node:22-bookworm-slim AS deps
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# The web workspace is omitted: its dependencies are large and this image never
# builds the client.
RUN npm ci --workspace @nym/shared --workspace @nym/api --include-workspace-root

# ---- Build -----------------------------------------------------------------
FROM deps AS build
WORKDIR /workspace

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build --workspace @nym/shared \
  && npm run build --workspace @nym/api

# ---- Production dependencies ----------------------------------------------
# A second, production-only install. Pruning in place would leave the build
# tools' transitive dependencies behind.
FROM deps AS prod-deps
WORKDIR /workspace

RUN npm ci --omit=dev --workspace @nym/shared --workspace @nym/api --include-workspace-root

# ---- Runtime ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /workspace

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# tini reaps the zombies a PID-1 Node process would otherwise leave behind, and
# forwards SIGTERM so Nest's shutdown hooks actually run.
RUN apt-get update \
  && apt-get install --no-install-recommends -y tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /workspace/node_modules ./node_modules
COPY --from=prod-deps /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/packages/shared/dist ./packages/shared/dist
COPY --from=build /workspace/packages/shared/package.json ./packages/shared/
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/package.json ./apps/api/
COPY package.json ./

# The stock `node` user, so the container never runs as root.
USER node

WORKDIR /workspace/apps/api
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
