FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/backend/vip-service ./apps/backend/vip-service
COPY packages ./packages
RUN npm install
CMD ["npm", "run", "dev", "--workspace", "apps/backend/vip-service"]

