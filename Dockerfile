# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build

WORKDIR /app
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_PROGRESS=false

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --fund=false --progress=false

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.medusa ./.medusa
COPY --from=build /app/medusa-config.ts ./medusa-config.ts

EXPOSE 9000

CMD ["npm", "run", "start"]
