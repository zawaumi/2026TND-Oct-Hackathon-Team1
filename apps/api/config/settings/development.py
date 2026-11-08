import os
import secrets

from .base import *  # noqa: F403
from .database import postgres_database

DEBUG = True
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or secrets.token_urlsafe(50)
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"]

if any(name in os.environ for name in ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST", "POSTGRES_PORT")):
    DATABASES = {"default": postgres_database()}
