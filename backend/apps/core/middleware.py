from __future__ import annotations

from django.conf import settings
from django.http import HttpResponseNotFound


class LocalhostAdminOnlyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/admin/") and settings.SCROPIDS_ADMIN_LOCALHOST_ONLY:
            host = request.get_host().split(":")[0].strip().strip("[]").lower()
            if host not in settings.SCROPIDS_ADMIN_LOCAL_HOSTS:
                return HttpResponseNotFound("Not found")
        return self.get_response(request)
