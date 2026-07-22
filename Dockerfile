# Node server pro vyúčtovací nabídky.
FROM node:20-alpine
WORKDIR /app
# nejdřív manifest kvůli cache vrstvy s závislostmi
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
