FROM node:22-alpine
WORKDIR /app

# Only runtime deps for the API (pg). Keeps the image small on a rural connection.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server/ server/

EXPOSE 8788
CMD ["node", "server/sync/sync-server.mjs"]
