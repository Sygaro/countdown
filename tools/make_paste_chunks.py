#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_paste_chunks.py (ryddet)
- Ryddet DEFAULT_EXCLUDES (ingen duplikater, ingen feilmellomrom i globs)
- Nytt: --list-only for å se treff uten å skrive filer
"""
import argparse
import hashlib
from pathlib import Path
from typing import List, Tuple

DEFAULT_INCLUDES = [
    "**/*.py", "**/*.js", "**/*.ts", "**/*.tsx",
    "**/*.css", "**/*.scss", "**/*.html",
    "**/*.json", "**/*.md", "**/*.sh",
]

# Ryddet liste
DEFAULT_EXCLUDES = [
    "**/.git/**", "**/.hg/**", "**/.svn/**",
    "**/venv/**", "**/.venv/**", "**/env/**",
    "**/node_modules/**", "**/__pycache__/**",
    "**/.mypy_cache/**", "**/.pytest_cache/**",
    "**/.DS_Store",
    # Hvis du alltid vil utelate markdown:
    # "*.md",
    # Prosjektspesifikke mapper kan legges i .pastechunksrc i stedet
]

FRAME_TOP = "===== BEGIN FILE ====="
FRAME_END = "===== END FILE ====="
CODE_BEGIN = "----- BEGIN CODE -----"
CODE_END = "----- END CODE -----"

import os

def sha256_file(path: Path) -> str:
    import hashlib
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def is_text_utf8(path: Path) -> bool:
    try:
        with path.open("rb") as f:
            data = f.read()
        data.decode("utf-8")
        return True
    except Exception:
        return False

def read_text_utf8(path: Path) -> str:
    with path.open("rb") as f:
        data = f.read()
    return data.decode("utf-8", errors="replace")

def normalize_newlines(s: str) -> str:
    return s.replace("\r\n", "\n").replace("\r", "\n")

def _brace_expand_one(pattern: str) -> List[str]:
    start = pattern.find("{")
    if start == -1:
        return [pattern]
    depth = 0
    for i in range(start, len(pattern)):
        if pattern[i] == "{":
            depth += 1
        elif pattern[i] == "}":
            depth -= 1
            if depth == 0:
                inside = pattern[start+1:i]
                before = pattern[:start]
                after = pattern[i+1:]
                parts = [p.strip() for p in inside.split(",") if p.strip() != ""]
                expanded = []
                for p in parts:
                    expanded.append(before + p + after)
                result = []
                for e in expanded:
                    result.extend(_brace_expand_one(e))
                return result
    return [pattern]

def brace_expand(pattern: str) -> List[str]:
    acc = [pattern]
    changed = True
    while changed:
        changed = False
        new_acc = []
        for p in acc:
            expanded = _brace_expand_one(p)
            if len(expanded) > 1 or expanded[0] != p:
                changed = True
            new_acc.extend(expanded)
        acc = new_acc
    return acc

def normalize_pattern(pat: str) -> str:
    while pat.startswith("/"):
        pat = pat[1:]
    return pat

def expand_patterns(patterns: List[str]) -> List[str]:
    out = []
    for pat in patterns:
        pat = normalize_pattern(pat)
        out.extend(brace_expand(pat))
    seen = set()
    uniq = []
    for p in out:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq

def collect_files(root: Path, includes: List[str], excludes: List[str]) -> List[Path]:
    root = root.resolve()
    includes = expand_patterns(includes)
    excludes = expand_patterns(excludes)

    files = set()
    for pattern in includes:
        for p in root.glob(pattern):
            if p.is_file():
                files.add(p.resolve())

    excluded = set()
    for pattern in excludes:
        for p in root.glob(pattern):
            if p.is_file():
                excluded.add(p.resolve())
            elif p.exists() and p.is_dir():
                for sub in p.rglob("*"):
                    if sub.is_file():
                        excluded.add(sub.resolve())

    return sorted([p for p in files if p not in excluded])

def build_framed_block(path: Path, content: str, sha256: str) -> str:
    content = normalize_newlines(content)
    lines = content.split("\n")
    line_count = len(lines)
    header = [
        FRAME_TOP,
        f"PATH: {path.as_posix()}",
        f"LINES: {line_count}",
        "CHUNK: 1/1",
        f"SHA256: {sha256}",
        CODE_BEGIN,
    ]
    footer = [CODE_END, FRAME_END]
    return "\n".join(header) + "\n" + content + "\n" + "\n".join(footer) + "\n"

def count_lines(s: str) -> int:
    return s.count("\n") + (0 if s.endswith("\n") else 1)

def write_chunks(blocks: List[Tuple[Path, str]], out_dir: Path, max_lines: int) -> List[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    buf = []
    buf_lines = 0
    part = 1

    def flush():
        nonlocal buf, buf_lines, part
        if not buf:
            return
        out_path = out_dir / f"paste_{part:03d}.txt"
        with out_path.open("w", encoding="utf-8") as f:
            f.write("".join(buf))
        outputs.append(out_path)
        buf = []
        buf_lines = 0

    for (_path, block) in blocks:
        block_lines = count_lines(block)
        if buf_lines + block_lines > max_lines and buf:
            flush()
            part += 1
        buf.append(block)
        buf_lines += block_lines

    flush()
    return outputs

def create_index(mapping: List[Tuple[Path, Path]], out_dir: Path):
    index_path = out_dir / "INDEX.txt"
    with index_path.open("w", encoding="utf-8") as f:
        f.write("# Index over filer og hvilken paste_NNN.txt de ligger i\n\n")
        current = None
        for out_file, src in mapping:
            if out_file != current:
                f.write(f"\n## {out_file.name}\n")
                current = out_file
            f.write(f"- {src.as_posix()}\n")
    return index_path

def main():
    ap = argparse.ArgumentParser(description="Lag innlimingsklare tekstfiler uten splitting av enkeltfiler.")
    ap.add_argument("--root", required=True, help="Rotmappe til prosjektet/repoet.")
    ap.add_argument("--out", required=True, help="Output-katalog for paste_*.txt og INDEX.txt")
    ap.add_argument("--max-lines", type=int, default=4000, help="Maks antall linjer per utdatafil (inkl. ramme). Standard 4000.")
    ap.add_argument("--include", action="append", default=None, help="Glob-mønster å inkludere (kan gjentas). Støtter {a,b,c}.")
    ap.add_argument("--exclude", action="append", default=None, help="Glob-mønster å ekskludere (kan gjentas). Støtter {a,b,c}.")
    ap.add_argument("--allow-binary", action="store_true", help="Tillat binærfiler (som hex dump). Default: hopper over.")
    ap.add_argument("--list-only", action="store_true", help="Bare list filene som ville blitt inkludert og avslutt.")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    out_dir = Path(args.out).resolve()
    includes = args.include if args.include else DEFAULT_INCLUDES
    excludes = (args.exclude if args.exclude else []) + DEFAULT_EXCLUDES

    sources = collect_files(root, includes, excludes)
    if not sources:
        print("Ingen filer funnet med de angitte mønstrene.")
        return

    if args.list_only:
        print(f"{len(sources)} fil(er):")
        for s in sources:
            print("-", s.relative_to(root).as_posix())
        return

    blocks = []
    skipped = []
    for src in sources:
        if is_text_utf8(src):
            text = read_text_utf8(src)
            digest = sha256_file(src)
            rel = src.relative_to(root)
            block = build_framed_block(rel, text, digest)
            blocks.append((src, block))
        else:
            if args.allow_binary:
                with src.open("rb") as f:
                    data = f.read()
                hex_dump = data.hex()
                digest = hashlib.sha256(data).hexdigest()
                rel = src.relative_to(root)
                block = build_framed_block(rel, hex_dump, digest)
                blocks.append((src, block))
            else:
                skipped.append(src)

    blocks.sort(key=lambda t: t[0].as_posix())
    outputs = write_chunks(blocks, out_dir, args.max_lines)

    mapping = []
    for out_file in outputs:
        with out_file.open("r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("PATH: "):
                    p = line.strip().split("PATH: ", 1)[1]
                    mapping.append((out_file, Path(p)))

    index_path = create_index(mapping, out_dir)

    print(f"Skrev {len(outputs)} output-fil(er) til: {out_dir.as_posix()}")
    for p in outputs:
        with p.open("r", encoding="utf-8") as fh:
          lc = sum(1 for _ in fh)
        print(f" - {p.name}  ({lc} linjer)")
    if skipped:
        print("\nHoppet over binær/ikke-UTF8-filer (bruk --allow-binary for å inkludere):")
        for s in skipped:
            print(f" - {s.relative_to(root).as_posix()}")
    print(f"\nINDEX: {index_path.as_posix()}")

if __name__ == "__main__":
    main()
