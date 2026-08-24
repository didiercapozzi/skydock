FROM node:24-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY build ./build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start"]
