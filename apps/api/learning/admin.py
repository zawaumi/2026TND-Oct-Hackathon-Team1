from django.contrib import admin

from .models import LearningSession, SessionLesson


class SessionLessonInline(admin.TabularInline):
    model = SessionLesson
    extra = 0


@admin.register(LearningSession)
class LearningSessionAdmin(admin.ModelAdmin):
    list_display = ["id", "owner", "status", "started_at", "finished_at"]
    list_filter = ["status"]
    inlines = [SessionLessonInline]
