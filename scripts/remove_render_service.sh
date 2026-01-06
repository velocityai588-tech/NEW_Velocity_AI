#!/bin/sh
# Simple helper to delete a Render service via API.
# Usage:
#   RENDER_API_KEY=xx SERVICE_ID=svc_xxx ./scripts/remove_render_service.sh
# This will send a DELETE request to Render API to remove the named service.

if [ -z "$RENDER_API_KEY" ] || [ -z "$SERVICE_ID" ]; then
  echo "Usage: RENDER_API_KEY=your_key SERVICE_ID=your_service_id $0"
  exit 1
fi

echo "Deleting Render service $SERVICE_ID"

curl -s -X DELETE \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Accept: application/json" \
  "https://api.render.com/v1/services/$SERVICE_ID" \
  -o /tmp/render-delete-response.json

cat /tmp/render-delete-response.json

if [ $? -eq 0 ]; then
  echo "Request completed. Check Render dashboard to confirm removal and any dependent resources (databases, env vars)."
else
  echo "Failed to call Render API. Check RENDER_API_KEY and SERVICE_ID." 
fi
