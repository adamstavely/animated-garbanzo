# syntax=docker/dockerfile:1.7
#
# Nym web image: the compiled Angular bundle behind nginx.
#
# Build from the repository root:
#
#   docker build -f apps/web/Dockerfile -t nym-web:1.0.0 .

# ---- Build -----------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --workspace @nym/shared --workspace @nym/web --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npm run build --workspace @nym/shared \
  && npm run build --workspace @nym/web

# ---- Runtime ---------------------------------------------------------------
# The unprivileged image listens on 8080 as a non-root user out of the box; the
# stock nginx image needs root to bind 80.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Config is mounted from the chart's ConfigMap in Kubernetes. This copy keeps
# `docker run` working on its own, with the same behaviour.
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist/web/browser /usr/share/nginx/html

EXPOSE 8080
