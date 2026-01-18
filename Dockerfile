FROM oven/bun:1.3-alpine AS base

USER bun

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

COPY ./src ./src

FROM base AS migrate

COPY ./drizzle.config.ts .

CMD ["db:migrate"]

FROM base AS producer

CMD ["src/producer/index.ts"]
