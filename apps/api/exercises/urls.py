from django.urls import path

from .views import ExerciseAttemptView, ExerciseCreateView

urlpatterns = [
    path("sessions/<int:session_id>/exercises/", ExerciseCreateView.as_view(), name="exercise-create"),
    path("exercises/<int:exercise_id>/attempt/", ExerciseAttemptView.as_view(), name="exercise-attempt"),
]
