from django.urls import path

from .views import EvaluationView, MessageView, SessionDetailView, SessionFinishView, SessionListView, TurnView

urlpatterns = [
    path("sessions/", SessionListView.as_view(), name="session-list"),
    path("sessions/<int:session_id>/", SessionDetailView.as_view(), name="session-detail"),
    path("sessions/<int:session_id>/finish/", SessionFinishView.as_view(), name="session-finish"),
    path("sessions/<int:session_id>/evaluation/", EvaluationView.as_view(), name="session-evaluation"),
    path("sessions/<int:session_id>/messages/", MessageView.as_view(), name="session-messages"),
    path("sessions/<int:session_id>/turns/<str:request_id>/", TurnView.as_view(), name="session-turn"),
]
