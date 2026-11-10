from django.contrib import admin

from .models import Peer, PeerKnowledge


@admin.register(Peer)
class PeerAdmin(admin.ModelAdmin):
    list_display = ["owner", "display_name", "knowledge_version"]


@admin.register(PeerKnowledge)
class PeerKnowledgeAdmin(admin.ModelAdmin):
    list_display = ["peer", "concept", "status", "verified_correct", "reset_epoch"]
    list_filter = ["status"]
