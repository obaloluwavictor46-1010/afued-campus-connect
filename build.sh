#!/bin/bash
bun run build || true
mkdir -p dist-static
cp -r .vercel/output/static/. dist-static/ 2>/dev/null || true
rm -rf .vercel/output
JS=$(ls -S dist-static/assets/*.js 2>/dev/null | head -n 1 | sed 's|dist-static/||')
CSS=$(ls -S dist-static/assets/*.css 2>/dev/null | head -n 1 | sed 's|dist-static/||')
if [ ! -f dist-static/index.html ]; then
  printf '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>AFUED Campus Connect</title><link rel="stylesheet" href="/%s"/></head><body><div id="root"></div><script type="module" src="/%s"></script></body></html>' "$CSS" "$JS" > dist-static/index.html
fi
echo "---JS:$JS CSS:$CSS---"
ls -R dist-static | head -n 100
