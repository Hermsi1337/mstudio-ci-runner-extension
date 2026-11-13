FROM node:26-alpine AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Node 26 images no longer ship corepack, so npm installs the pinned pnpm.
RUN npm install --global "$(node -p 'require("./package.json").packageManager')" && \
    pnpm install --frozen-lockfile

FROM node:26-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:26-alpine AS runner
ARG EXTENSION_VERSION
WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/Hermsi1337/mstudio-ci-runner-extension" \
      org.opencontainers.image.description="mittwald mStudio extension that provisions CI runners on Container Hosting" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="codeBoarder - Inh. Dennis Hermsmeier"

ENV NODE_ENV=production
ENV PORT=3000
ENV EXTENSION_VERSION=${EXTENSION_VERSION}

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 tanstack

COPY --from=builder --chown=tanstack:nodejs /app/.output ./
COPY --from=builder --chown=tanstack:nodejs /app/src/db/migrations ./src/db/migrations

USER tanstack

EXPOSE 3000

CMD ["node", "server/index.mjs"]
