# ぴあとも API のコンテナ（Cloud Run 用、#57 で配備する）
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    PORT=8080

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install -r requirements.txt

COPY . .

# root で動かさない
RUN useradd --create-home --uid 10001 app
USER app

# 秘密鍵・許可するホスト・DB の接続先は、実行時の環境変数で渡す（イメージに入れない）
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT} --workers 2 --timeout 60"]
