#!/usr/bin/env python3
"""Compare generated TypeScript bindings to the committed copy.

The four singleton contracts embed `networks.testnet` (a deployed address).
`program` does not. Generating from local wasm never writes that block, so a
naive file diff fails even when the contract *interface* is unchanged.

This compares everything after the optional `networks` export, so address
embedding cannot cause a spurious diff.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

HEADER_RE = re.compile(
    r"if \(typeof window !== \"undefined\"\) \{.*?\n\}\n",
    re.DOTALL,
)
NETWORKS_RE = re.compile(
    r"\n*export const networks = \{.*?\} as const\n*",
    re.DOTALL,
)


def interface_body(text: str) -> str:
    text = text.replace("\r\n", "\n")
    match = HEADER_RE.search(text)
    rest = text[match.end() :] if match else text
    rest = NETWORKS_RE.sub("\n\n", rest, count=1)
    return rest.lstrip("\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("committed")
    parser.add_argument("generated")
    args = parser.parse_args()

    committed = pathlib.Path(args.committed).read_text(encoding="utf-8")
    generated = pathlib.Path(args.generated).read_text(encoding="utf-8")
    left = interface_body(committed)
    right = interface_body(generated)
    if left == right:
        return 0

    sys.stderr.write(
        f"interface mismatch: {args.committed} vs {args.generated}\n"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
