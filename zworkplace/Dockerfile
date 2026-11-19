# سيرفر Z-Project Workplace — صورة صغيرة (Node 22 فيه node:sqlite مدمج)
FROM node:22-alpine

WORKDIR /app
COPY server ./server
COPY index.html ./
COPY css ./css
COPY js ./js
COPY fonts ./fonts
COPY assets ./assets

ENV PORT=3100 ZDB=/data/zwork.db NODE_ENV=production
RUN mkdir -p /data && addgroup -S zwork && adduser -S zwork -G zwork && chown -R zwork:zwork /data /app
USER zwork
VOLUME ["/data"]
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3100/api/health >/dev/null || exit 1

CMD ["node", "server/index.js"]
