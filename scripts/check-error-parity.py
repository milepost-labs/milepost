#!/usr/bin/env python3
"""Check that frontend error explanations cover the contract error enums."""

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
ERRORS = ROOT / "frontend/src/lib/errors.ts"

CONTRACTS = {
    "program": (ROOT / "contracts/program/src/lib.rs", "Error"),
    "attest": (ROOT / "contracts/attest/src/lib.rs", "Error"),
    "record": (ROOT / "contracts/record/src/lib.rs", "Error"),
    "registry": (ROOT / "contracts/registry/src/lib.rs", "Error"),
    "policy": (ROOT / "contracts/policy-spend/src/lib.rs", "SpendError"),
}
TABLES = {
    "program": "PROGRAM",
    "attest": "ATTEST",
    "record": "RECORD",
    "registry": "REGISTRY",
    "policy": "POLICY",
}


def contract_errors(path: Path, enum_name: str) -> dict[int, str]:
    source = path.read_text()
    match = re.search(
        rf"#\[contracterror\].*?pub enum {enum_name}\s*\{{(.*?)\n\}}",
        source,
        re.DOTALL,
    )
    if not match:
        raise RuntimeError(f"could not find {enum_name} in {path}")
    return {
        int(code): variant
        for variant, code in re.findall(r"^\s*(\w+)\s*=\s*(\d+)\s*,", match.group(1), re.MULTILINE)
    }


def table_errors(source: str, table_name: str) -> dict[int, str]:
    match = re.search(rf"const {table_name}: Table = \{{(.*?)\n\}};", source, re.DOTALL)
    if not match:
        raise RuntimeError(f"could not find {table_name} in {ERRORS}")
    return {
        int(code): f"table entry {code}"
        for code in re.findall(r"^\s*(\d+)\s*:\s*\{", match.group(1), re.MULTILINE)
    }


def main() -> int:
    source = ERRORS.read_text()
    failures = 0
    for contract, (path, enum_name) in CONTRACTS.items():
        expected = contract_errors(path, enum_name)
        actual = table_errors(source, TABLES[contract])
        for code in sorted(expected.keys() - actual.keys()):
            print(f"{contract}: missing table entry for code {code} ({expected[code]})")
            failures += 1
        for code in sorted(actual.keys() - expected.keys()):
            print(f"{contract}: table has code {code}, but contract has no matching error variant")
            failures += 1
    if failures:
        print(f"error: {failures} contract/frontend error mapping mismatch(es)", file=sys.stderr)
        return 1
    print("Contract error tables match their #[contracterror] enums.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
