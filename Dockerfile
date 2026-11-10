FROM node:24-bookworm-slim

WORKDIR /app

ARG SERVICE_NAME

# Copy only the selected service's dependency files
COPY ${SERVICE_NAME}/package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy that service's source code and Prisma schema
COPY ${SERVICE_NAME}/ ./

# Generate Prisma Client for this service
RUN npx prisma generate --schema=prisma/schema.prisma

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "start"]