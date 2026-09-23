FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY api/package.json api/package-lock.json ./api/
WORKDIR /app/api
RUN npm ci

COPY api/ ./
COPY lani_logo.png /app/lani_logo.png
COPY web/public/lani_logo.png /app/web/public/lani_logo.png

ENV PARTNERSHIP_HOST=0.0.0.0
ENV PARTNERSHIP_PORT=8080
ENV PIPELINE_DB_PATH=/data/partnership-pipeline.db

EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
