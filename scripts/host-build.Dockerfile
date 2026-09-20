# What SkyDock is built with for the machine the development container runs on.
#
# The container is Ubuntu 26.04 and the machine outside it need not be: a program built in here
# carries that system's libraries with it — its C library, and the web engine the window is — and
# lands on the other one unable to start, or worse, drawing a board that answers nothing. So the
# app meant for the machine is built on the machine's own system.
#
# Built and run by `scripts/build-for-host.sh`, which reads the version off the machine itself.
ARG UBUNTU_VERSION=24.04
FROM ubuntu:${UBUNTU_VERSION}

ARG DEBIAN_FRONTEND=noninteractive

# the window's engine and what it is linked against, and the media tools the app carries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    file \
    ffmpeg \
    git \
    libayatana-appindicator3-dev \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    libxdo-dev \
    librsvg2-dev \
    patchelf \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

ENV CARGO_HOME=/usr/local/cargo \
    RUSTUP_HOME=/usr/local/rustup \
    PATH=/usr/local/cargo/bin:$PATH

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain stable --profile minimal --no-modify-path

WORKDIR /workspace
