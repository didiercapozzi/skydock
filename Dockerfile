FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    coreutils \
    util-linux \
    exfat-fuse \
    exfatprogs \
    dosfstools \
    udev \
    ffmpeg \
    rsync \
    curl \
    jq \
    ca-certificates \
    git \
    shellcheck \
    tree \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY scripts/ /app/scripts/
RUN chmod +x /app/scripts/*.sh

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
