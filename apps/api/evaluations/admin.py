from django.contrib import admin

from .models import Criterion, CriterionResult, Evaluation, Rubric


class CriterionInline(admin.TabularInline):
    model = Criterion
    extra = 0


@admin.register(Rubric)
class RubricAdmin(admin.ModelAdmin):
    list_display = ("id", "lesson", "version", "status", "created_at")
    list_filter = ("status",)
    inlines = [CriterionInline]


class CriterionResultInline(admin.TabularInline):
    model = CriterionResult
    extra = 0
    readonly_fields = ("criterion", "status", "score", "evidence_count", "explanation")
    can_delete = False


@admin.register(Evaluation)
class EvaluationAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "status", "total_score", "rubric", "engine", "created_at")
    list_filter = ("status", "engine")
    readonly_fields = [f.name for f in Evaluation._meta.fields]
    inlines = [CriterionResultInline]
