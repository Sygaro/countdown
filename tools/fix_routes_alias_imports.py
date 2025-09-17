# tools/fix_routes_alias_imports.py
from __future__ import annotations
import re
from pathlib import Path

ROUTES_DIR = Path("app/routes")
ALIAS_IMPORT = (
    "from app.storage.api import (\n"
    "    get_config as cfg_get_config,\n"
    "    patch_config as cfg_patch_config,\n"
    "    replace_config as cfg_replace_config,\n"
    ")\n"
)

def ensure_alias_import(src: str) -> str:
    # 1) Hvis det allerede finnes korrekt alias-import, gjør ingenting
    if "get_config as cfg_get_config" in src and "patch_config as cfg_patch_config" in src:
        return src

    lines = src.splitlines(keepends=True)

    # 2) Fjern evt. eksisterende storage.api-import (uansett form) for å erstatte med alias
    pattern_import_any = re.compile(r'^[ \t]*from[ \t].*storage\.api[ \t]+import[^\n]*\n?', re.MULTILINE)
    src_no_old = re.sub(pattern_import_any, "", src)

    # 3) Finn slutten av import-blokken øverst (shebang/encoding/blank/comment + import/from-linjer)
    lines2 = src_no_old.splitlines(keepends=True)
    insert_at = 0
    i = 0
    while i < len(lines2):
        line = lines2[i]
        stripped = line.strip()
        if stripped.startswith("#!") and i == 0:
            insert_at = i + 1
        elif stripped.startswith("#") or stripped == "":
            insert_at = i + 1
        elif stripped.startswith("from ") or stripped.startswith("import "):
            insert_at = i + 1
        else:
            break
        i += 1

    lines2.insert(insert_at, ALIAS_IMPORT)
    return "".join(lines2)

def replace_calls_with_alias(src: str) -> str:
    s = src

    # Rydd opp tidligere stor-C-variant om den finnes
    s = re.sub(r'\bcfg_replaceConfig\(', 'cfg_replace_config(', s)

    # Bytt funksjonskall -> alias (ikke i def-linjer)
    # Negativ lookbehind for "def " og "as " (for imports/as alias), og for "cfg_" (allerede alias).
    patterns = [
        (r'(?<!def\s)(?<!as\s)(?<!cfg_)get_config\(', 'cfg_get_config('),
        (r'(?<!def\s)(?<!as\s)(?<!cfg_)patch_config\(', 'cfg_patch_config('),
        (r'(?<!def\s)(?<!as\s)(?<!cfg_)replace_config\(', 'cfg_replace_config('),
    ]
    for pat, repl in patterns:
        s = re.sub(pat, repl, s)

    return s

def process_file(p: Path) -> bool:
    before = p.read_text(encoding="utf-8")
    after = ensure_alias_import(before)
    after = replace_calls_with_alias(after)
    if after != before:
        p.write_text(after, encoding="utf-8")
        return True
    return False

def main() -> None:
    changed = []
    for py in sorted(ROUTES_DIR.glob("*.py")):
        if process_file(py):
            changed.append(py)
    if changed:
        print("Oppdatert:", ", ".join(str(x) for x in changed))
    else:
        print("Ingen endringer nødvendig.")

if __name__ == "__main__":
    main()
