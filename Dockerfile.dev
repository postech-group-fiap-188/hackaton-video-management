FROM node:20-alpine

WORKDIR /srv

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npm run build

RUN sed -i 's/\r$//' /srv/docker/*.sh || true

RUN chmod +x /srv/docker/entrypoint.sh /srv/docker/wait-port.sh

EXPOSE 3000 9229

CMD ["sh","-lc","/srv/docker/entrypoint.sh"]
