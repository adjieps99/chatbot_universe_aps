# KRESNA V3 local-first Docker image
FROM node:22-bookworm-slim AS app

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first for better layer caching.
COPY package.json ./
RUN npm install --no-audit --no-fund

# The SQLite database and uploads are included in the image as the initial
# workspace seed. The named Docker volume preserves them after first startup.
COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
