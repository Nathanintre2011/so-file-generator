FROM node:20-bullseye

# --- Install Android NDK (command-line, headless) ---
ARG NDK_VERSION=r26d
ENV ANDROID_NDK_ROOT=/opt/android-ndk-${NDK_VERSION}
ENV NDK_HOST_TAG=linux-x86_64

RUN apt-get update && apt-get install -y --no-install-recommends \
      unzip curl ca-certificates \
    && curl -fsSL -o /tmp/ndk.zip \
      https://dl.google.com/android/repository/android-ndk-${NDK_VERSION}-linux.zip \
    && unzip -q /tmp/ndk.zip -d /opt \
    && rm /tmp/ndk.zip \
    && apt-get purge -y unzip curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# --- App ---
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

RUN mkdir -p work output

EXPOSE 3000
CMD ["node", "server.js"]
