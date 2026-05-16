FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/backend/notification-service ./apps/backend/notification-service
RUN npm install
CMD ["npm", "run", "dev", "--workspace", "apps/backend/notification-service"]

