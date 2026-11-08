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
