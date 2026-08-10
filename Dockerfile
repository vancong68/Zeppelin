FROM node:24-slim

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

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

WORKDIR /zeppelin
RUN pnpm install --frozen-lockfile

# Copy source files
COPY --chown=node:node . /zeppelin

# Build all packages (shared -> backend, dashboard)
RUN pnpm run build

# Prune dev dependencies for production
RUN pnpm prune --prod

ENV NODE_ENV=production

# Make entrypoint executable
RUN chmod +x /zeppelin/entrypoint.sh

# dockerCommand in render.yaml (or `docker run ... bot`) passes: migrate | bot | api | dashboard
ENTRYPOINT ["/zeppelin/entrypoint.sh"]
