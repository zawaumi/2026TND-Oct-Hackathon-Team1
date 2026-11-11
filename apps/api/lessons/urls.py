from django.urls import path

from .views import KnowledgeGraphView, LessonDetailView, LessonListView

urlpatterns = [
    path("lessons/", LessonListView.as_view(), name="lesson-list"),
    path("lessons/<int:lesson_id>/", LessonDetailView.as_view(), name="lesson-detail"),
    path("knowledge-graph/", KnowledgeGraphView.as_view(), name="knowledge-graph"),
]
