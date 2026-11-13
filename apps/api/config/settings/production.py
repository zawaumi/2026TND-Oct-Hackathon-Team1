import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .database import postgres_database


def required_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ImproperlyConfigured(f"{name} must be set in production")
    return value


def env_list(name):
    return [v.strip() for v in os.environ.get(name, "").split(",") if v.strip()]


DEBUG = False
SECRET_KEY = required_env("DJANGO_SECRET_KEY")
# 例: .run.app,tnd2026-oct-hackathon.web.app,tnd2026-oct-hackathon.firebaseapp.com
# （Firebase Hosting からの転送は Cloud Run の *.run.app の名前で届く。docs/deploy.md）
ALLOWED_HOSTS = [host.strip() for host in required_env("DJANGO_ALLOWED_HOSTS").split(",") if host.strip()]
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must contain explicit hosts")

# Cloud SQL には、Cloud Run が用意する Unix ソケット（POSTGRES_HOST=/cloudsql/<接続名>）でつなぐ
DATABASES = {"default": postgres_database()}
DATABASES["default"]["CONN_MAX_AGE"] = 60
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

# Cloud Run・Firebase Hosting は HTTPS で受けて、X-Forwarded-Proto を付けて転送する
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
# 管理画面（/admin/）は、本番では既定で出さない（Cloud Run の *.run.app から直接見えてしまうため）。
# どうしても使うときだけ DJANGO_ADMIN_ENABLED=true にし、使い終わったら外す
ADMIN_ENABLED = os.environ.get("DJANGO_ADMIN_ENABLED", "").strip().lower() == "true"
# 管理画面にログインするときの呼び出し元（ADMIN_ENABLED のときだけ使う）。例: https://tnd2026-oct-hackathon.web.app
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

# Cloud Run は標準出力をログに集める。会話の本文や鍵はログに出さない（各モジュールの方針）
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(levelname)s %(name)s %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
    "loggers": {"django": {"handlers": ["console"], "level": "WARNING", "propagate": False}},
}
