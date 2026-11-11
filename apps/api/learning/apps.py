from django.apps import AppConfig


class LearningConfig(AppConfig):
    # docs/02 の表の「sessions」アプリ。Django の sessions と名前がぶつかるので learning にした
    name = "learning"
    verbose_name = "授業"
