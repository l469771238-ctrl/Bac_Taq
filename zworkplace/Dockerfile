# Z-Project Workplace
# صورة خفيفة: مش عليها ملفات المستخدمين — الملفات في تخزين خارجي
FROM node:22-slim

WORKDIR /app

COPY package.json ./
COPY server ./server
COPY js ./js
COPY css ./css
COPY fonts ./fonts
COPY index.html ./
COPY data ./data

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# السيرفر بيحمّل كشف الأسماء من data/students.csv أول تشغيل
CMD ["node", "server/index.js"]
