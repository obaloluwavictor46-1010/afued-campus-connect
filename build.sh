#!/bin/bash
bun run build || true
mkdir -p dist-static
cp -r .vercel/output/static/. dist-static/ 2>/dev/null || true
rm -rf .vercel/output
echo "=== FIND MANIFEST ==="
find dist-static -name "manifest.json" | head -n 20
MANIFEST=$(find dist-static -name "manifest.json" | head -n 1)
echo "MANIFEST=$MANIFEST"
cat "$MANIFEST" 2>/dev/null | head -c 3000
echo ""
echo "=== PICK ENTRY FROM MANIFEST ==="
JS=$(python3 -c "
import json, glob, sys
for f in glob.glob('dist-static/**/manifest.json', recursive=True):
    try:
        m=json.load(open(f))
        for k,v in m.items():
            if isinstance(v, dict) and v.get('isEntry'):
                print(v.get('file',''))
                sys.exit(0)
        for k,v in m.items():
            if 'entry' in k.lower() or 'main' in k.lower():
                if isinstance(v, dict) and 'file' in v:
                    print(v['file']); sys.exit(0)
    except Exception as e:
        print('ERR',e, file=sys.stderr)
" | head -n 1)
echo "ENTRY_FROM_MANIFEST=$JS"
if [ -z "$JS" ]; then
  JS=$(ls -S dist-static/assets/*.js 2>/dev/null | head -n 1 | sed 's|dist-static/||')
fi
CSS=$(ls -S dist-static/assets/*.css 2>/dev/null | head -n 1 | sed 's|dist-static/||')
if [ ! -f dist-static/index.html ]; then
  printf '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>AFUED Campus Connect</title><link rel="stylesheet" href="/%s"/></head><body><div id="root"></div><script type="module" src="/%s"></script></body></html>' "$CSS" "$JS" > dist-static/index.html
fi
echo "---FINAL JS:$JS CSS:$CSS---"
ls -R dist-static | head -n 100
