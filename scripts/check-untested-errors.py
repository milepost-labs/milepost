#!/usr/bin/env python3
"""Fail when a contract error variant is never asserted by that contract's tests.

An error nobody tests is a guard nobody would notice removing. For every
variant of every `#[contracterror]` enum in `contracts/*/src/lib.rs`, this
looks through the same contract's test files (`contracts/<name>/src/*test*.rs`)
for either:

- the variant by name, as `Enum::Variant` (e.g. `Error::FeeTooHigh`), or
- its code, as `Error(Contract, #N)` (the form `should_panic` messages use).

Comments are stripped first, so a test that only *describes* an error does not
count as asserting it. A code is ambiguous when two enums in one contract share
it, and then only the name counts.

Some variants cannot be reached. Those go in the allowlist with a reason, one
per line:

    <contract> <Enum>::<Variant>  <reason>

An entry with no reason, for a variant that does not exist, or for a variant
that is now tested fails the check too, so the list cannot rot.

Usage: scripts/check-untested-errors.py [--root DIR] [--allowlist FILE]
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

ENUM_RE = re.compile(
    r"#\[contracterror\][^{]*?\benum\s+(\w+)\s*\{(.*?)\n\}",
    re.DOTALL,
)
VARIANT_RE = re.compile(r"^\s*(\w+)\s*=\s*(\d+)\s*,?\s*$", re.MULTILINE)
CODE_RE = re.compile(r"Error\(\s*Contract\s*,\s*#(\d+)\s*\)")


def strip_comments(text: str) -> str:
    """Drop `/* */` blocks and `//` line comments (doc comments included)."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", text)


def parse_enums(lib: str) -> list[tuple[str, str, int]]:
    """Return (enum, variant, code) for every `#[contracterror]` variant."""
    found = []
    for enum_match in ENUM_RE.finditer(strip_comments(lib)):
        enum, body = enum_match.groups()
        for variant, code in VARIANT_RE.findall(body):
            # `_Reserved = N` placeholders hold a removed variant's code and
            # are never returned (CONTRIBUTING, error code stability rule 2).
            if not variant.startswith("_"):
                found.append((enum, variant, int(code)))
    return found


def parse_allowlist(path: pathlib.Path) -> tuple[dict[tuple[str, str], str], list[str]]:
    """Return ({(contract, "Enum::Variant"): reason}, [errors])."""
    entries: dict[tuple[str, str], str] = {}
    errors = []
    if not path.exists():
        return entries, errors
    for number, raw in enumerate(path.read_text().splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(maxsplit=2)
        where = f"{path.name}:{number}"
        if len(parts) < 2 or "::" not in parts[1]:
            errors.append(f"{where}: expected '<contract> <Enum>::<Variant> <reason>'")
            continue
        if len(parts) < 3:
            errors.append(f"{where}: {parts[0]} {parts[1]} has no reason")
            continue
        key = (parts[0], parts[1])
        if key in entries:
            errors.append(f"{where}: {parts[0]} {parts[1]} is listed twice")
            continue
        entries[key] = parts[2]
    return entries, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    root_default = pathlib.Path(__file__).resolve().parent.parent
    parser.add_argument("--root", type=pathlib.Path, default=root_default)
    parser.add_argument("--allowlist", type=pathlib.Path)
    args = parser.parse_args()
    root = args.root.resolve()
    allowlist_path = args.allowlist or root / "scripts" / "untested-errors-allowlist.txt"

    allowed, errors = parse_allowlist(allowlist_path)
    untested = []
    known = set()

    for lib_path in sorted(root.glob("contracts/*/src/lib.rs")):
        contract = lib_path.parent.parent.name
        variants = parse_enums(lib_path.read_text())
        if not variants:
            continue
        tests = "\n".join(
            strip_comments(p.read_text())
            for p in sorted(lib_path.parent.glob("*test*.rs"))
        )
        codes_used = {int(n) for n in CODE_RE.findall(tests)}
        code_owners: dict[int, int] = {}
        for _, _, code in variants:
            code_owners[code] = code_owners.get(code, 0) + 1

        for enum, variant, code in variants:
            name = f"{enum}::{variant}"
            known.add((contract, name))
            by_name = re.search(rf"\b{enum}::{variant}\b", tests) is not None
            by_code = code in codes_used and code_owners[code] == 1
            tested = by_name or by_code
            key = (contract, name)
            if key in allowed:
                if tested:
                    errors.append(
                        f"{contract} {name} (#{code}) is allowlisted but now tested;"
                        " remove it from the allowlist"
                    )
            elif not tested:
                untested.append(f"{contract} {name} (#{code})")

    for contract, name in sorted(allowed.keys() - known):
        errors.append(f"{contract} {name} is allowlisted but no such variant exists")

    for line in untested:
        print(f"untested: {line}", file=sys.stderr)
    for line in errors:
        print(f"allowlist: {line}", file=sys.stderr)

    if untested or errors:
        if untested:
            print(
                f"\n{len(untested)} error variant(s) never asserted by their contract's"
                " tests. Assert each one (by name or as Error(Contract, #N)), or, if it"
                f" cannot be reached, add it to {allowlist_path.relative_to(root)}"
                " with a reason.",
                file=sys.stderr,
            )
        return 1

    print(f"Every contract error variant is tested or allowlisted ({len(known)} checked).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
