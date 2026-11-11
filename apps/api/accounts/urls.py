from django.urls import path

from .views import MeView, OnboardingView

urlpatterns = [
    path("users/me/", MeView.as_view(), name="users-me"),
    path("onboarding/complete/", OnboardingView.as_view(), name="onboarding-complete"),
]
