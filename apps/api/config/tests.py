from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config.settings.database import postgres_database


class DatabaseSettingsTests(SimpleTestCase):
    def test_complete_postgres_configuration(self):
        values = {
            "POSTGRES_DB": "piatomo", "POSTGRES_USER": "user",
            "POSTGRES_PASSWORD": "password", "POSTGRES_HOST": "db", "POSTGRES_PORT": "5432",
        }
        with patch.dict("os.environ", values, clear=True):
            database = postgres_database()
        self.assertEqual(database["ENGINE"], "django.db.backends.postgresql")
        self.assertEqual(database["HOST"], "db")
        self.assertEqual(database["NAME"], "piatomo")

    def test_incomplete_configuration_is_rejected(self):
        with patch.dict("os.environ", {"POSTGRES_DB": "piatomo"}, clear=True):
            with self.assertRaisesRegex(ImproperlyConfigured, "POSTGRES_PASSWORD"):
                postgres_database()


class ApiNoStoreTests(SimpleTestCase):
    def test_api_responses_are_not_cached(self):
        res = self.client.get("/api/v1/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Cache-Control"], "private, no-store")

    def test_error_responses_are_not_cached(self):
        self.assertEqual(self.client.get("/api/v1/users/me/")["Cache-Control"], "private, no-store")


class ProductionSettingsTests(SimpleTestCase):
    ENV = {
        "DJANGO_SECRET_KEY": "test-only-secret-key-that-is-long-enough-0123456789",
        "DJANGO_ALLOWED_HOSTS": ".run.app,example.web.app",
        "DJANGO_CSRF_TRUSTED_ORIGINS": "https://example.web.app",
        "POSTGRES_DB": "piatomo", "POSTGRES_USER": "piatomo", "POSTGRES_PASSWORD": "pw",
        "POSTGRES_HOST": "/cloudsql/project:asia-northeast1:piatomo-db", "POSTGRES_PORT": "5432",
    }

    def load(self, env):
        import importlib
        import sys

        with patch.dict("os.environ", env, clear=True):
            module = sys.modules.get("config.settings.production")
            if module is None:
                return importlib.import_module("config.settings.production")
            return importlib.reload(module)

    def test_behind_proxy_and_cloud_sql(self):
        s = self.load(self.ENV)
        self.assertFalse(s.DEBUG)
        self.assertEqual(s.ALLOWED_HOSTS, [".run.app", "example.web.app"])
        self.assertEqual(s.SECURE_PROXY_SSL_HEADER, ("HTTP_X_FORWARDED_PROTO", "https"))
        self.assertEqual(s.CSRF_TRUSTED_ORIGINS, ["https://example.web.app"])
        self.assertEqual(s.DATABASES["default"]["HOST"], "/cloudsql/project:asia-northeast1:piatomo-db")
        self.assertTrue(s.SESSION_COOKIE_SECURE and s.CSRF_COOKIE_SECURE)

    def test_wildcard_host_is_rejected(self):
        with self.assertRaises(ImproperlyConfigured):
            self.load({**self.ENV, "DJANGO_ALLOWED_HOSTS": "*"})

    def test_secret_key_is_required(self):
        env = dict(self.ENV)
        del env["DJANGO_SECRET_KEY"]
        with self.assertRaises(ImproperlyConfigured):
            self.load(env)
