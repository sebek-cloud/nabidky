# Jednoduchý Node server pro vyúčtovací nabídky (žádné závislosti).
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
