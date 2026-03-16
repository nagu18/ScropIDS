from __future__ import annotations

from django.utils.translation import gettext_lazy as _
from rest_framework import authentication
from rest_framework.exceptions import AuthenticationFailed

from .models import Agent


class AgentTokenAuthentication(authentication.BaseAuthentication):
    """
    Agent auth via:
      - X-Agent-ID: UUID
      - X-Agent-Token: opaque token
    """

    agent_id_header = "HTTP_X_AGENT_ID"
    agent_token_header = "HTTP_X_AGENT_TOKEN"

    def authenticate(self, request):
        agent_id = request.META.get(self.agent_id_header)
        token = request.META.get(self.agent_token_header)
        if not agent_id and not token:
            return None
        if not agent_id or not token:
            raise AuthenticationFailed(_("Both X-Agent-ID and X-Agent-Token are required."))

        try:
            agent = Agent.objects.get(pk=agent_id)
        except Agent.DoesNotExist as exc:
            raise AuthenticationFailed(_("Invalid agent credentials.")) from exc

        if not agent.check_token(token):
            raise AuthenticationFailed(_("Invalid agent credentials."))

        agent.touch_last_seen()
        return (agent, None)
