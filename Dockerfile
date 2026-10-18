FROM node:24-slim

# Enable corepack for pnpm (version is pinned via the `packageManager` field in package.json)
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

RUN mkdir /zeppelin
RUN chown node:node /zeppelin

USER node

# Install dependencies before copying over any other files
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml /zeppelin/

RUN mkdir /zeppelin/backend
COPY --chown=node:node backend/package.json /zeppelin/backend/

RUN mkdir /zeppelin/shared
COPY --chown=node:node shared/package.json /zeppelin/shared/

RUN mkdir /zeppelin/dashboard
COPY --chown=node:node dashboard/package.json /zeppelin/dashboard/

RUN mkdir /zeppelin/config-checker
COPY --chown=node:node config-checker/package.json /zeppelin/config-checker/

WORKDIR /zeppelin
RUN pnpm install --frozen-lockfile

# Copy source files
COPY --chown=node:node . /zeppelin

# Build all packages (shared -> backend, dashboard)
RUN pnpm run build

# Install only production dependencies for the runtime.
# NOTE: `pnpm prune --prod` must NOT be used here - it has a workspace bug that
# removes production dependencies of workspace packages (e.g. fastify from the
# dashboard), causing "Cannot find package 'fastify'" at startup on Render.
# A clean --prod reinstall keeps all runtime deps while dropping dev dependencies.
RUN rm -rf node_modules && pnpm install --prod --frozen-lockfile

# The pnpm store is only needed during the installs above. Removing it keeps
# the image small - node_modules entries are hard links into the store and
# remain valid after it is deleted.
RUN rm -rf /zeppelin/.pnpm-store

ENV NODE_ENV=production

# Optional build info, matching the upstream image layout (read by the !about
# command; upstream's build-image.sh passes these as build args).
ARG COMMIT_HASH=unknown
ARG BUILD_TIME=unknown
RUN echo "$COMMIT_HASH" > /zeppelin/.commit-hash && echo "$BUILD_TIME" > /zeppelin/.build-time

# Make entrypoint executable
RUN chmod +x /zeppelin/entrypoint.sh

# dockerCommand in render.yaml (or `docker run ... bot`) passes: migrate | bot | api | dashboard
ENTRYPOINT ["/zeppelin/entrypoint.sh"]
