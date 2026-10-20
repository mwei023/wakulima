FROM node:22-alpine
WORKDIR /app

# The 2.1 snapshot receiver is zero-dependency — no npm install at all.
COPY server/ server/

EXPOSE 8787
CMD ["node", "server/backup-server.mjs"]
