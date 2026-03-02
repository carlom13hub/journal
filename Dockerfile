# Stage 1: Build the frontend
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Run the server
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx
COPY server/ ./server/
COPY --from=build /app/dist ./dist/
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
