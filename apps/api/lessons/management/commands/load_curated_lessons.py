"""公開教材（CURATED）の小単元・概念を、データファイルから開発DBへ投入する。

    python manage.py load_curated_lessons --check       # 検査だけ（DBを触らない）。例題の検算の結果を出す
    python manage.py load_curated_lessons               # 下書き（draft）として投入する
    python manage.py load_curated_lessons --publish     # レビュー済み（review.status=approved）のときだけ公開する

- 何度実行しても同じ結果になる（コードや名前で探して、なければ作り、あれば更新する）。
- 既定では公開しない。公開できるのは、数学内容と出典のレビュー（別の人）が記録されたときだけ。
  開発DBで画面を試すためだけに、DEBUG=True のときに限り --allow-unreviewed で公開できる（本番では使えない）。
- すでに公開されている教材を、このコマンドが下書きに戻すことはない。
- 前提関係（ConceptPrerequisite）と習得条件（MasteryPolicy）のモデルがまだないときは、その分を飛ばす。
  データファイルには入っているので、モデルができたら再実行すればよい。
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from lessons.curated import validate_dataset
from lessons.models import Concept, CurriculumItem, CurriculumRevision, Lesson, LessonConcept, Scope

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "data" / "curated_jhs1_math_equation.json"


class Command(BaseCommand):
    help = "公開教材（CURATED）の小単元・概念をデータファイルから投入する"

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(DEFAULT_FILE), help="データファイル（既定：lessons/data/curated_jhs1_math_equation.json）")
        parser.add_argument("--check", action="store_true", help="検査だけ行い、DBには何も書かない")
        parser.add_argument("--publish", action="store_true", help="レビュー済みの教材を公開する")
        parser.add_argument("--allow-unreviewed", action="store_true", help="DEBUG=True のときだけ、レビュー前でも公開する（開発用）")

    def handle(self, *args, **opts):
        path = Path(opts["file"])
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            raise CommandError(f"データファイルを読めません: {path}（{e}）") from e

        problems = validate_dataset(data)
        if problems:
            raise CommandError("データファイルに問題があります。投入しません。\n" + "\n".join(f"  - {p}" for p in problems))

        n_examples = sum(len(c.get("examples", [])) for c in data["concepts"])
        n_lessons = sum(1 for l in data["lessons"] if l["kind"] == "lesson")
        self.stdout.write(f"検査OK：小単元 {n_lessons}、概念 {len(data['concepts'])}、例題 {n_examples}（すべての式変形を検算済み）")
        review = data["review"]
        self.stdout.write(f"レビュー：{review['status']}（数学：{review.get('math_reviewer') or '未'}、出典：{review.get('source_reviewer') or '未'}）")
        if opts["check"]:
            return

        publish = self._may_publish(review, opts)
        with transaction.atomic():
            self._load(data, publish)

    # ------------------------------------------------------------------
    def _may_publish(self, review, opts) -> bool:
        if not opts["publish"]:
            if opts["allow_unreviewed"]:
                raise CommandError("--allow-unreviewed は --publish と一緒に使います。")
            return False
        if review["status"] == "approved":
            return True
        if opts["allow_unreviewed"] and settings.DEBUG:
            self.stdout.write(self.style.WARNING("注意：レビュー前の教材を、開発用に公開します（DEBUG=True のときだけ許されます）。"))
            return True
        raise CommandError(
            "数学内容と出典のレビューが記録されていないので、公開できません。"
            "（レビューの記録は docs/materials/jhs1_math_equation_review.md。"
            "開発DBで画面を試すだけなら、DEBUG=True で --allow-unreviewed を付けます）"
        )

    def _load(self, data, publish):
        # ---- 学習指導要領の版と項目
        rev_data = data["curriculum"]["revision"]
        revision, _ = CurriculumRevision.objects.update_or_create(
            code=rev_data["code"],
            defaults={"name": rev_data["name"], "issued_year": rev_data["issued_year"], "source_url": rev_data["source_url"]},
        )
        items = {}
        for order, it in enumerate(data["curriculum"]["items"], start=1):
            parent = items.get(it["parent"])
            item, _ = CurriculumItem.objects.update_or_create(
                revision=revision, parent=parent, type=it["type"], title=it["title"],
                defaults={"official_code": it.get("official_code", ""), "sort_order": order},
            )
            items[it["key"]] = item

        # ---- 概念
        concepts = {}
        for c in data["concepts"]:
            obj, _ = Concept.objects.update_or_create(
                code=c["code"],
                defaults={"title": c["title"], "description": c["description"], "difficulty": c.get("difficulty"),
                          "scope": Scope.CURATED, "owner": None},
            )
            concepts[c["code"]] = obj

        # ---- 教材（領域 → 単元 → 小単元）。公開するのは publish=True のときだけ
        lessons = {}
        mvp_keys = {l["key"] for l in data["lessons"] if l.get("publish_scope") == "mvp"}
        for l in data["lessons"]:  # 親が先に並んでいる
            parent = lessons.get(l["parent"])
            lesson = Lesson.objects.filter(
                parent=parent, title=l["title"], scope=Scope.CURATED, school_level="middle", subject="math"
            ).first() or Lesson(parent=parent, title=l["title"], scope=Scope.CURATED, school_level="middle", subject="math")
            lesson.grade = l["grade"]
            lesson.sort_order = l["sort_order"]
            lesson.mode = Lesson.Mode.PRESET
            lesson.curriculum_item = items.get(l.get("curriculum_item"))
            if publish and l["key"] in mvp_keys:
                lesson.status = Lesson.Status.PUBLISHED  # 公開済みを下書きに戻すことはしない
            lesson.save()
            lessons[l["key"]] = lesson
            for order, code in enumerate(l.get("concepts", []), start=1):
                LessonConcept.objects.update_or_create(lesson=lesson, concept=concepts[code], defaults={"sort_order": order})

        # ---- 前提関係（モデルがあるときだけ）
        edges = [(p, c["code"]) for c in data["concepts"] for p in c.get("prerequisites", [])]
        try:
            from lessons.models import ConceptPrerequisite  # noqa: PLC0415  あとで追加されるモデル
        except ImportError:
            ConceptPrerequisite = None
        if ConceptPrerequisite is None:
            self.stdout.write(self.style.WARNING(f"前提関係 {len(edges)} 本：ConceptPrerequisite がまだないので投入しません。モデルができたら再実行してください。"))
        else:
            for pre, code in edges:
                ConceptPrerequisite.objects.get_or_create(concept=concepts[code], prerequisite=concepts[pre])
            self.stdout.write(f"前提関係 {len(edges)} 本を投入しました。")
        self.stdout.write(self.style.WARNING("習得条件（MasteryPolicy）：モデルができるまで投入しません（データファイルには入っています）。"))

        n_pub = Lesson.objects.filter(scope=Scope.CURATED, status=Lesson.Status.PUBLISHED, id__in=[x.id for x in lessons.values()]).count()
        self.stdout.write(self.style.SUCCESS(
            f"投入しました：教材 {len(lessons)}（うち公開 {n_pub}）、概念 {len(concepts)}、教材と概念の対応 {LessonConcept.objects.filter(lesson__in=lessons.values()).count()}"
        ))
