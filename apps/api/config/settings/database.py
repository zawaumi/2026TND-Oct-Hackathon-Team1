import os

from django.core.exceptions import ImproperlyConfigured


def postgres_database():
    names = ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST", "POSTGRES_PORT")
    missing = [name for name in names if not os.environ.get(name, "").strip()]
    if missing:
        raise ImproperlyConfigured("Missing PostgreSQL settings: " + ", ".join(missing))
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ["POSTGRES_DB"],
        "USER": os.environ["POSTGRES_USER"],
        "PASSWORD": os.environ["POSTGRES_PASSWORD"],
        "HOST": os.environ["POSTGRES_HOST"],
        "PORT": os.environ["POSTGRES_PORT"],
    }
