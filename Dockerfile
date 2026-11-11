# One container: the API, the Reactivity watcher, the mirror worker and the built web app.
FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY web ./web
RUN npm run build

ENV NODE_ENV=production \
    NETWORK=hideki \
    DATA_DIR=/data \
    SLIPPAGE_BPS=75 \
    MAX_ORDERS_PER_HOUR=60

# The host injects PORT (Render and Railway both do). MASTER_KEY must be set as a secret.
CMD ["npx", "tsx", "src/server.ts"]
