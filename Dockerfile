# syntax=docker/dockerfile:1
#
# Multi-stage build for the CADGPT server (Express/Nest API + static Angular dashboard).
# No native npm dependencies are used (SQLite access goes through the Node 24 built-in
# `node:sqlite` module), so a plain Alpine base is sufficient.

ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------------------
# deps: install full (dev+prod) workspace dependencies, used only to build
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# ---------------------------------------------------------------------------
# build: compile the API (tsc) and build the Angular dashboard (ng build)
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# prod-deps: install only the API's production dependencies. Both workspace
# manifests are copied so the lockfile validates; -w api limits installation
# to the api workspace plus root dependencies.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev -w api --include-workspace-root

# ---------------------------------------------------------------------------
# runtime: minimal image containing the compiled API, the static SPA bundle
# and only the production node_modules
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app

# Workspace deps are hoisted to the repo-root node_modules by npm.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
# main.ts resolves the SPA at "../web/dist/web/browser" relative to the
# process cwd, so the layout below must mirror the repo's dev-time paths.
COPY --from=build /app/apps/web/dist/web/browser apps/web/dist/web/browser

RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
WORKDIR /app/apps/api
EXPOSE 3000

# Alpine ships BusyBox wget; avoids adding curl just for a health probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q -O- "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "dist/main.js"]
