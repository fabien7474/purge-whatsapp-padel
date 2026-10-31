# Image pour lancer la purge sur un serveur Linux (Beelink) : Node + Chromium du système.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-color-emoji ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    TZ=Europe/Paris \
    HOME=/tmp

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY test ./test
COPY config.example.json liste-blanche.example.txt ./

CMD ["npm", "test"]
