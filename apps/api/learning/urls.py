from django.urls import path

from .views import SessionDetailView, SessionFinishView, SessionListView

urlpatterns = [
    path("sessions/", SessionListView.as_view(), name="session-list"),
    path("sessions/<int:session_id>/", SessionDetailView.as_view(), name="session-detail"),
    path("sessions/<int:session_id>/finish/", SessionFinishView.as_view(), name="session-finish"),
]
