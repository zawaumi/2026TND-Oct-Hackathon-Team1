"""DeepSeek に1回だけつないで、ぴあ友の発話の JSON が返るか確かめる。

  python manage.py deepseek_check
  python manage.py deepseek_check --action request_example --message "移項は符号を変えて反対側に移すこと"

キー（DEEPSEEK_API_KEY）は表示しない。送るのは下の架空の教材と、--message の文章だけ。
"""

import json

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from integrations.deepseek import DeepSeekClient, get_client
from integrations.payload import PeerTurnInput


class Command(BaseCommand):
    help = "DeepSeek に1回つないで、ぴあ友の発話（検証前の JSON）を表示する"

    def add_arguments(self, parser):
        parser.add_argument("--action", default="ask_why")
        parser.add_argument("--message", default="移項は、項の符号を変えて反対側の辺に移すことだよ。x + 3 = 7 なら x = 7 - 3。")

    def handle(self, *args, **opts):
        client = get_client()
        if not isinstance(client, DeepSeekClient):
            raise CommandError("DEEPSEEK_API_KEY が設定されていないため、モックになっています。キーを環境変数に入れてから実行してください。")
        self.stdout.write(f"model={settings.DEEPSEEK_MODEL} base_url={settings.DEEPSEEK_BASE_URL}（キーは表示しません）")
        result = client.generate(
            PeerTurnInput(
                action=opts["action"],
                concept_id=103,
                concept_title="移項",
                concept_description="項の符号を変えて、等式の反対側の辺へ移す",
                lesson_title="移項",
                teacher_message=opts["message"],
            )
        )
        self.stdout.write(f"error={result.error} latency_ms={result.latency_ms}")
        if result.parsed is not None:
            self.stdout.write(json.dumps(result.parsed, ensure_ascii=False, indent=2))
