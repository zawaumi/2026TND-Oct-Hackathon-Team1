from django.contrib import admin

from .models import Exercise, ExerciseAttempt, MasteryEvidence


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "target_concept", "kind", "verification_status", "form", "created_at")
    list_filter = ("verification_status", "kind")


@admin.register(ExerciseAttempt)
class ExerciseAttemptAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise", "peer", "result", "reason", "blocked_skill", "created_at")
    list_filter = ("result",)


@admin.register(MasteryEvidence)
class MasteryEvidenceAdmin(admin.ModelAdmin):
    list_display = ("id", "peer", "concept", "variant_code", "reset_epoch", "created_at")
