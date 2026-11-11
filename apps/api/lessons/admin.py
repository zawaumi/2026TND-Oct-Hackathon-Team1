from django.contrib import admin

from .models import Concept, CurriculumItem, CurriculumRevision, Lesson, LessonConcept


class LessonConceptInline(admin.TabularInline):
    model = LessonConcept
    extra = 1
    autocomplete_fields = ["concept"]


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ["title", "parent", "school_level", "grade", "subject", "status", "sort_order"]
    list_filter = ["status", "school_level", "grade", "subject", "scope"]
    search_fields = ["title"]
    inlines = [LessonConceptInline]


@admin.register(Concept)
class ConceptAdmin(admin.ModelAdmin):
    list_display = ["code", "title", "scope"]
    search_fields = ["code", "title"]


admin.site.register(CurriculumRevision)
admin.site.register(CurriculumItem)
