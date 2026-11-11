from django.urls import path

from .views import PeerKnowledgeView, PeerMeView

urlpatterns = [
    path("peers/me/", PeerMeView.as_view(), name="peer-me"),
    path("peers/me/knowledge/", PeerKnowledgeView.as_view(), name="peer-knowledge"),
]
