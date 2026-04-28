#!/bin/sh
set -e

# ScropIDS Agent Docker Entrypoint
# Handles auto-enrollment via environment variables

AGENT_BIN="/app/scropids-agent"

# Check if credentials are already configured
if [ -f "$HOME/.scropids/agent_config.json" ]; then
    echo "Found existing agent config, using it..."
    exec "$AGENT_BIN"
fi

# If org access token and org slug are provided, auto-enroll
if [ -n "$SCROPIDS_ORG_ACCESS_TOKEN" ] && [ -n "$SCROPIDS_ORG_SLUG" ]; then
    echo "Auto-enrolling agent with organization access token..."
    # The agent binary will handle this when it starts - just run it
    # The environment variables will be picked up by mergeConfigWithEnv()
    exec "$AGENT_BIN"
fi

# If agent ID and token are provided, use them directly
if [ -n "$SCROPIDS_AGENT_ID" ] && [ -n "$SCROPIDS_AGENT_TOKEN" ]; then
    echo "Using provided agent credentials..."
    exec "$AGENT_BIN"
fi

# Otherwise, run the agent (will either use saved config or prompt for setup)
exec "$AGENT_BIN"
