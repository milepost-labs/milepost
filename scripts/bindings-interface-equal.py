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


SPEC_ENTRY_RE = re.compile(r'"[A-Za-z0-9+/=]{16,}"')


def normalise_spec_order(text: str) -> str:
    """Sort the ContractSpec base64 entries.

    The generator emits one base64 XDR entry per function, type and event, and
    the order it chooses has changed between CLI versions. Order carries no
    meaning — the spec is a set — so comparing it as a sequence reports drift
    for bindings that are semantically identical. Sorting still catches an
    entry being added, removed or altered, which is the thing we care about.
    """
    entries = sorted(SPEC_ENTRY_RE.findall(text))
    return SPEC_ENTRY_RE.sub("\x00SPEC\x00", text) + "\n" + "\n".join(entries)


def interface_body(text: str) -> str:
    text = text.replace("\r\n", "\n")
    # `policy__` takes Vec<Context>, and Context lives in the smart wallet's
    # spec rather than this contract's, so the generator emits a type it never
    # declares. generate-bindings.sh widens it to `any` so the package
    # compiles; normalise both sides here so that is not read as drift.
    text = text.replace("contexts: Array<Context>", "contexts: Array<any>")
    match = HEADER_RE.search(text)
    rest = text[match.end() :] if match else text
    rest = NETWORKS_RE.sub("\n\n", rest, count=1)
    return normalise_spec_order(rest.lstrip("\n"))


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
