FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
RUN mkdir -p /data
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
