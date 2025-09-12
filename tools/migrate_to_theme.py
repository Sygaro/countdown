#!/usr/bin/env python3
# tools/migrate_to_theme.py
"""
Migrerer eksisterende config til å inkludere 'theme.digits.size_vw'.
Kjører trygt; lager backup config.json.YYYYMMDDHHMMSS.
"""
from __future__ import annotations
import json, time, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CFG  = ROOT / "config.json"

def main():
    if not CFG.exists():
        print("Fant ikke config.json – ingenting å migrere.")
        return
    ts = time.strftime("%Y%m%d%H%M%S")
    backup = CFG.with_suffix(f".json.{ts}.bak")
    shutil.copy2(CFG, backup)
    with CFG.open("r", encoding="utf-8") as f:
        cfg = json.load(f)
    theme = cfg.get("theme") or {}
    digits = theme.get("digits") or {}
    if "size_vw" not in digits:
        digits["size_vw"] = 14  # standard
    theme["digits"] = digits
    cfg["theme"] = theme
    cfg.setdefault("_updated_at", int(time.time()))
    with CFG.open("w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    print(f"OK. Backup lagret som {backup}")

if __name__ == "__main__":
    main()
