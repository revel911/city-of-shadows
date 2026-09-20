FROM node:20-alpine

WORKDIR /app

ARG APP_REVISION=unknown
ENV APP_REVISION=$APP_REVISION

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["node", "index.js"]
