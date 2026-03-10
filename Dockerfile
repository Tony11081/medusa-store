# syntax=docker/dockerfile:1.7
FROM node:20-alpine

WORKDIR /app
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_PROGRESS=false \
    MEDUSA_DISABLE_ADMIN=false \
    PORT=9000

RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --fund=false --progress=false

COPY . .
RUN npm run build

COPY docker-start.sh /usr/local/bin/docker-start.sh
RUN chmod +x /usr/local/bin/docker-start.sh

ENV NODE_ENV=production

EXPOSE 9000

CMD ["docker-start.sh"]
