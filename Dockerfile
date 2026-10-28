FROM node:24-bookworm-slim AS dependencias
WORKDIR /app/site
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates
COPY site/package.json site/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --build-from-source=sqlite3

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app/site
COPY --from=dependencias --chown=node:node /app/site/node_modules ./node_modules
COPY --chown=node:node site/ ./
COPY deploy/start-site.sh /app/start-site.sh
RUN mkdir -p /data && chown node:node /data && ln -s /data/banco.db /app/site/banco.db
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/status-esp').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "/app/start-site.sh"]
