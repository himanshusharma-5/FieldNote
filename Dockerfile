FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8787
ENV DATABASE_PATH=/var/lib/fieldnote/fieldnote.sqlite
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/db ./db
COPY --from=build --chown=node:node /app/dist/client ./dist/client
RUN mkdir -p /var/lib/fieldnote && chown node:node /var/lib/fieldnote
USER node
EXPOSE 8787
CMD ["node", "server/index.js"]
