# syntax=docker/dockerfile:1.7
# Builds the NEXPLAY server. One image runs both services: SERVICE=api (API) and SERVICE=games (game host).
#   target "runtime": small production image, runs as a non-root user
#   target "tools":   adds the database client and dev tools, used for migrations and creating the admin account
ARG NODE_VERSION=22

# ---- build: install everything, generate the database client, compile TypeScript ----
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

# ---- prod-deps: only the packages the running server needs ----
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
# the generated database client comes from the build stage
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# ---- tools: migrations, role setup and the admin scripts ----
FROM build AS tools
ENV NODE_ENV=development
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*
COPY scripts ./scripts
USER node
CMD ["sh", "scripts/db-bootstrap.sh"]

# ---- runtime: what actually runs in production ----
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 4000 4001
# SERVICE=games listens on GAMES_PORT, everything else on PORT
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD ["node", "-e", "const p = process.env.SERVICE === 'games' ? (process.env.GAMES_PORT || 4001) : (process.env.PORT || 4000); fetch('http://127.0.0.1:' + p + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
