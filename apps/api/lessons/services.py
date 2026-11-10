from django.core.exceptions import ValidationError


def assert_no_lesson_cycle(lesson, parent):
    """lesson の親を parent にしたとき、階層が循環しないことを確かめる。

    parent から根までたどり、途中に lesson 自身が出てきたら循環。
    DB 制約では防げないので、保存の前に必ずここを通す（docs/02 の 1 の注）。
    """
    if parent is None:
        return
    if lesson.pk is not None and parent.pk == lesson.pk:
        raise ValidationError("教材を自分自身の下に置くことはできません。", code="lesson_cycle")
    seen = set()
    node = parent
    while node is not None:
        if lesson.pk is not None and node.pk == lesson.pk:
            raise ValidationError("教材の階層が循環します。", code="lesson_cycle")
        if node.pk in seen:  # 既存データが壊れていても無限ループにしない
            raise ValidationError("教材の階層がすでに循環しています。", code="lesson_cycle")
        seen.add(node.pk)
        node = node.parent
