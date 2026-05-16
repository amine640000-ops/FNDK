FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/frontend ./apps/frontend
COPY packages ./packages
RUN npm install
CMD ["npm", "run", "dev", "--workspace", "apps/frontend", "--", "--host", "0.0.0.0"]

