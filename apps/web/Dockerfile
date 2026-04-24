FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY packages/shared/package*.json ./packages/shared/
RUN npm install
COPY . .
CMD ["npm", "run", "dev", "--workspace", "@smartcrm/web"]
