FROM node:24-slim

RUN apt-get update -qq && apt-get install -y -qq \
    ffmpeg vainfo intel-gpu-tools \
    intel-media-va-driver libva-drm2 libva-x11-2 libva2 \
    xvfb libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2t64 libxshmfence1 \
    libglib2.0-0 libgtk-3-0 libnotify4 libxtst6 \
    libatspi2.0-0 libuuid1 libsecret-1-0 \
    libgl1 libegl1 libglx-mesa0 \
    fonts-noto \
    && (apt-get install -y -qq libvpl2 2>/dev/null || apt-get install -y -qq libmfx1 2>/dev/null || true) \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start"]
