ARG BUILD_FROM
FROM ${BUILD_FROM:-ghcr.io/home-assistant/amd64-base:3.21}

ENV LANG=C.UTF-8 \
    NODE_ENV=production

# Node and build deps for native modules (better-sqlite3)
RUN apk add --no-cache \
    nodejs \
    npm \
    jq \
    python3 \
    make \
    g++

WORKDIR /opt/finance-dashboard

COPY app/package*.json ./
RUN npm install --omit=dev

# VAPID keys are provided via Home Assistant addon options (config.yaml) and exported in run.sh
COPY app/ .

COPY run.sh /usr/local/bin/run.sh
RUN sed -i 's/\r$//' /usr/local/bin/run.sh && chmod +x /usr/local/bin/run.sh

COPY rootfs/ /
RUN chmod +x /etc/services.d/finance-dashboard/run

EXPOSE 3000
