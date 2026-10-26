#!/bin/bash
bun run build || true
mkdir -p dist-static
cp -r .vercel/output/static/. dist-static/ 2>/dev/null || true
rm -rf .vercel/output
echo "=== ORIGINAL INDEX.HTML FROM TANSTACK ==="
cat dist-static/index.html 2>/dev/null | head -c 3000
echo ""
echo "=== ALL ASSETS ==="
ls -lh dist-static/assets/
# Delete any index.html we created before, so we create fresh correct one
rm -f dist-static/index.html
# Use AppShell as entry - it is the real shell
JS=$(ls dist-static/assets/AppShell*.js 2>/dev/null | head -n 1 | sed 's|dist-static/||')
if [ -z "$JS" ]; then
  JS=$(ls dist-static/assets/*.js 2>/dev/null | head -n 1 | sed 's|dist-static/||')
fi
CSS=$(ls -S dist-static/assets/*.css 2>/dev/null | head -n 1 | sed 's|dist-static/||')
echo "USING JS=$JS CSS=$CSS"
printf '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>AFUED Campus Connect</title><link rel="stylesheet" href="/%s"/></head><body><div id="root"></div><script type="module" src="/%s"></script></body></html>' "$CSS" "$JS" > dist-static/index.html
echo "---FINAL JS:$JS CSS:$CSS---"
cat dist-static/index.html
