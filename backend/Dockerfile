# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS promptfoo
ENV PROMPTFOO_DISABLE_TELEMETRY=1 \
    PROMPTFOO_DISABLE_UPDATE=1 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && node --version \
    && ./node_modules/.bin/promptfoo --version

FROM python:3.12-slim-bookworm AS runtime
ARG INSTALL_LOCAL_ML=true
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PATH="/opt/venv/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin" \
    PROMPTFOO_DISABLE_TELEMETRY=1 \
    PROMPTFOO_DISABLE_UPDATE=1 \
    VALIDATOR_MODEL_CACHE_DIR=/var/cache/averiq/models \
    PROMPTFOO_WORKSPACE_ROOT=/tmp/averiq-promptfoo
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libgomp1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 averiq \
    && useradd --uid 10001 --gid averiq --create-home averiq \
    && python -m venv /opt/venv
COPY backend/requirements.txt backend/requirements-ml.txt /tmp/requirements/
RUN pip install --no-cache-dir -r /tmp/requirements/requirements.txt \
    && case "$INSTALL_LOCAL_ML" in \
         true) pip install --no-cache-dir 'torch==2.8.0' --index-url https://download.pytorch.org/whl/cpu \
               && pip install --no-cache-dir -r /tmp/requirements/requirements-ml.txt ;; \
         false) ;; \
         *) echo 'INSTALL_LOCAL_ML must be true or false' >&2; exit 1 ;; \
       esac \
    && pip check
COPY --from=promptfoo /usr/local/bin/node /usr/local/bin/node
COPY --from=promptfoo --chown=averiq:averiq /app/node_modules /app/node_modules
COPY --from=promptfoo --chown=averiq:averiq /app/package.json /app/package-lock.json /app/
WORKDIR /app/backend
COPY --chown=averiq:averiq backend/app ./app
COPY --chown=averiq:averiq backend/scripts ./scripts
COPY --chown=averiq:averiq backend/promptfoo_bridge ./promptfoo_bridge
COPY --chown=averiq:averiq docker/download_models.py /app/docker/download_models.py
RUN mkdir -p /var/cache/averiq/models /tmp/averiq-promptfoo \
    && chown -R averiq:averiq /var/cache/averiq /tmp/averiq-promptfoo
USER averiq
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
