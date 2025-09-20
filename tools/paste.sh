source venv/bin/activate
python3 tools/make_paste_chunks.py \
  --root . \
  --out ./paste_out \
  --max-lines 4000 \
  --include "/*.{sh,py,config.json}" \
  --include "app/**/*.py" \
  --include "static/**/*.{js,css,html}" \
  --exclude "*.md" \
  --exclude "**/tools /**" \
  --exclude "**/bin /**" \
  --exclude "**/setup /**" \
  --exclude "**/.git/**" \
  --exclude "**/venv/**" \
  --exclude "**/node_modules/**"
