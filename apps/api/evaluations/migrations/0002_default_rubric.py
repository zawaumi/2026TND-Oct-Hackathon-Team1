"""既定のルーブリック（draft-2026-11）を入れる（#40）。

データ移行は、あとでアプリのコードが変わっても同じ結果になるよう、値をここに書き写す（evaluations/defaults.py と同じ）。
"""

from django.db import migrations

VERSION = "draft-2026-11"
SOURCE_REF = "docs/03 F・G（ADR-015）。国研の教科別参考資料との対応は人のレビュー待ち"
CRITERIA = (
    ("accuracy", "正確さ", 40, ["重大な誤りがある", "重要な条件が複数欠ける", "一部は正しいが条件が不十分", "概ね正しい", "数学的に正確で必要な条件がある"]),
    ("logic", "論理性", 30, ["手順も理由も示されていない", "手順だけで理由がない", "理由はあるが飛躍がある", "概ね筋道が通っている", "手順と理由がつながり、質問にも根拠を示して答えている"]),
    ("clarity", "分かりやすさ", 30, ["つまずきに応えていない", "同じ説明を繰り返している", "言い換えか例のどちらかがある", "言い換えや例で概ね伝わる", "具体例と言い換えで、つまずきを解消している"]),
)


def add_default(apps, schema_editor):
    Rubric = apps.get_model("evaluations", "Rubric")
    Criterion = apps.get_model("evaluations", "Criterion")
    rubric, created = Rubric.objects.get_or_create(
        lesson=None, version=VERSION, defaults={"source_ref": SOURCE_REF, "status": "active"}
    )
    if created:
        for i, (code, name, weight, levels) in enumerate(CRITERIA):
            Criterion.objects.create(rubric=rubric, code=code, perspective=name, weight=weight, levels=levels, sort_order=i)


def remove_default(apps, schema_editor):
    Rubric = apps.get_model("evaluations", "Rubric")
    Rubric.objects.filter(lesson=None, version=VERSION, evaluations__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("evaluations", "0001_initial")]

    operations = [migrations.RunPython(add_default, remove_default)]
