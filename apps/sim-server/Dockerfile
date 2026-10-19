FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build -w @xew/shared && npm run build -w @xew/sim-server
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "apps/sim-server/dist/index.js"]
