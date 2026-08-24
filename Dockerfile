FROM node:24-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


FROM dependencies AS development

ENV NODE_ENV=development
COPY . .

EXPOSE 7198 8008
CMD ["sh", "-c", "npm run db:setup && npm run dev"]


FROM dependencies AS build

COPY . .
RUN npm run build


FROM node:24-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 7198 8008
CMD ["sh", "-c", "npm run db:setup && npm start"]
