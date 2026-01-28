FROM node:20-alpine
WORKDIR /srv/app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN chmod +x /srv/app/docker/entrypoint.dev.sh /srv/app/docker/wait-port.sh

EXPOSE 3000 9229
CMD ["node","dist/main.js"]
