#!/usr/bin/env bash
# يشغّل المنصة تلقائيًا في GitHub Codespaces (مناسب للتجربة من الجوال).
# رابط المنفذ 3000 في Codespaces يعمل بـ HTTPS، فتعمل كاميرا التحضير.
if [ -n "$CODESPACE_NAME" ]; then
  export APP_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
export DEMO_MODE=true
nohup npm run dev:local > /tmp/wafda.log 2>&1 &
echo "وفدة تعمل في الخلفية — ${APP_URL:-http://localhost:3000} (السجل: /tmp/wafda.log)"
