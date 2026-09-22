#!/bin/sh
# Stop whatever is on the port, then serve the current build. Starting a second
# next start on a busy port fails silently into a log and the old build keeps
# answering, which has now wasted two rounds of looking at stale pages.
PORT=${PORT:-3130}
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match '$PORT' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
sleep 2
npx next start -p "$PORT" > /tmp/serve.log 2>&1 &
for i in $(seq 1 40); do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "http://localhost:$PORT/" 2>/dev/null)
  [ "$c" = "200" ] && { echo "serving on $PORT"; exit 0; }
  sleep 2
done
echo "did not come up: $c"; tail -5 /tmp/serve.log; exit 1
