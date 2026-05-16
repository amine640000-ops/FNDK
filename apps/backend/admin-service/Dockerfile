FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/backend/admin-service ./apps/backend/admin-service
COPY packages ./packages
RUN npm install
CMD ["npm", "run", "dev", "--workspace", "apps/backend/admin-service"]

