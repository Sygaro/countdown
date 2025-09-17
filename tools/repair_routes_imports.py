from __future__ import annotations
import re
from pathlib import Path

ROUTES_DIR = Path("app/routes")

FUTURE_LINE = "from __future__ import annotations"
ALIAS_BLOCK = (
    "from app.storage.api import (\n"
    "    get_config as cfg_get_config,\n"
    "    patch_config as cfg_patch_config,\n"
    "    replace_config as cfg_replace_config,\n"
    ")\n"
)

def canonicalize_routes_file(src: str) -> str:
    s = src

    # --- 1) Remove ALL occurrences of future line; we'll reinsert exactly once
    s = re.sub(rf"^[ \t]*{re.escape(FUTURE_LINE)}[ \t]*\n", "", s, flags=re.MULTILINE)

    # --- 2) Strip ANY storage.api import lines (broken or full)
    s = re.sub(r'^[ \t]*from[ \t]+.*storage\.api[ \t]+import[^\n]*\n?', "", s, flags=re.MULTILINE)

    # Also strip stray alias lines left behind by a broken block
    stray_alias_lines = [
        r'^[ \t]*get_config as cfg_get_config,\s*$',
        r'^[ \t]*patch_config as cfg_patch_config,\s*$',
        r'^[ \t]*replace_config as cfg_replace_config,\s*$',
        r'^[ \t]*replace_config as cfg_replaceConfig,\s*$',  # legacy typo variant
        r'^[ \t]*\)\s*$',
    ]
    for pat in stray_alias_lines:
        s = re.sub(pat, "", s, flags=re.MULTILINE)

    # Collapse excessive blank lines caused by removal
    s = re.sub(r'\n{3,}', '\n\n', s)

    # --- 3) Find correct insertion point (after shebang/encoding + module docstring)
    lines = s.splitlines(keepends=True)
    i = 0

    # shebang
    if i < len(lines) and lines[i].startswith("#!"):
        i += 1
    # encoding
    if i < len(lines) and re.match(r"^#.*coding[:=]\s*utf-?8", lines[i].strip()):
        i += 1

    # skip blank/comment lines to check for docstring
    j = i
    while j < len(lines) and (lines[j].strip() == "" or lines[j].lstrip().startswith("#")):
        j += 1

    insert_at = i
    # handle module docstring
    if j < len(lines) and (lines[j].lstrip().startswith('"""') or lines[j].lstrip().startswith("'''")):
        quote = lines[j].lstrip()[:3]
        k = j
        if lines[j].count(quote) >= 2:
            # one-line docstring
            insert_at = j + 1
        else:
            k += 1
            while k < len(lines):
                if quote in lines[k]:
                    insert_at = k + 1
                    break
                k += 1

    # --- 4) Insert future line, a blank, alias block, a blank
    lines.insert(insert_at, FUTURE_LINE + "\n")
    insert_at += 1
    if insert_at >= len(lines) or lines[insert_at].strip() != "":
        lines.insert(insert_at, "\n")
        insert_at += 1
    lines.insert(insert_at, ALIAS_BLOCK)
    insert_at += 1
    if insert_at >= len(lines) or lines[insert_at].strip() != "":
        lines.insert(insert_at, "\n")

    s = "".join(lines)

    # --- 5) Normalize calls to use cfg_* aliases (not in def lines/import alias)
    s = re.sub(r'\bcfg_replaceConfig\(', 'cfg_replace_config(', s)
    s = re.sub(r'(?<!def\s)(?<!as\s)(?<!cfg_)get_config\(', 'cfg_get_config(', s)
    s = re.sub(r'(?<!def\s)(?<!as\s)(?<!cfg_)patch_config\(', 'cfg_patch_config(', s)
    s = re.sub(r'(?<!def\s)(?<!as\s)(?<!cfg_)replace_config\(', 'cfg_replace_config(', s)

    # --- 6) Deduplicate: ensure only one alias block and one future line
    # Remove any extra future lines beyond the first
    seen_future = False
    out_lines = []
    for line in s.splitlines(keepends=True):
        if line.strip() == FUTURE_LINE:
            if seen_future:
                continue
            seen_future = True
        out_lines.append(line)
    s = "".join(out_lines)

    # Remove duplicate alias blocks by keeping the first occurrence only
    alias_re = re.compile(
        r'^from app\.storage\.api import \(\n'
        r'[ \t]*get_config as cfg_get_config,\n'
        r'[ \t]*patch_config as cfg_patch_config,\n'
        r'[ \t]*replace_config as cfg_replace_config,\n'
        r'\)\n', re.MULTILINE
    )
    blocks = list(alias_re.finditer(s))
    if len(blocks) > 1:
        # keep first, remove the rest
        keep_start, keep_end = blocks[0].span()
        s2 = s[:keep_end] + alias_re.sub("", s[keep_end:])
        s = s2

    # Final tidy: collapse 3+ blank lines
    s = re.sub(r'\n{3,}', '\n\n', s)

    return s

def main() -> None:
    changed = []
    for py in sorted(ROUTES_DIR.glob("*.py")):
        original = py.read_text(encoding="utf-8")
        updated = canonicalize_routes_file(original)
        if updated != original:
            py.write_text(updated, encoding="utf-8")
            changed.append(str(py))
    print("Oppdatert filer:" if changed else "Ingen endringer nødvendig.", ", ".join(changed))

if __name__ == "__main__":
    main()
