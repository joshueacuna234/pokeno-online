FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates tar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY dockerignore.txt /app/dockerignore.txt
RUN cp /app/dockerignore.txt /app/.dockerignore

WORKDIR /opt/piper
RUN curl -fsSL https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz -o /tmp/piper.tar.gz \
    && tar -xzf /tmp/piper.tar.gz -C /opt/piper \
    && rm /tmp/piper.tar.gz \
    && mkdir -p /opt/piper/voice \
    && curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx?download=true -o /opt/piper/voice/es_MX-claude-high.onnx \
    && curl -fL https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx.json?download=true -o /opt/piper/voice/es_MX-claude-high.onnx.json

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production
ENV PIPER_BIN=/opt/piper/piper/piper
ENV PIPER_MODEL=/opt/piper/voice/es_MX-claude-high.onnx

CMD ["npm","start"]
