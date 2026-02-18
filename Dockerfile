# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /srv/app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build


# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /srv

ENV NODE_ENV=production
ENV NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /srv/app/dist ./dist

RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000
CMD ["node", "dist/main.js"]
