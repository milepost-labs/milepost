#!/usr/bin/env python3
"""Tests for scripts/check-untested-errors.py, run against throwaway contracts.

Usage: python3 scripts/check-untested-errors.test.py
"""

from __future__ import annotations

import pathlib
import subprocess
import sys
import tempfile
import textwrap
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent / "check-untested-errors.py"

LIB = """
#[contracterror]
#[derive(Copy, Clone)]
#[repr(u32)]
pub enum Error {
    /// Doc comments between variants are skipped.
    NotAuthorized = 1,
    FeeTooHigh = 2,
}
"""


class CheckUntestedErrors(unittest.TestCase):
    def run_check(self, lib: str, tests: str, allowlist: str = ""):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            src = root / "contracts" / "demo" / "src"
            src.mkdir(parents=True)
            (src / "lib.rs").write_text(textwrap.dedent(lib))
            (src / "test.rs").write_text(textwrap.dedent(tests))
            allow = root / "allowlist.txt"
            allow.write_text(textwrap.dedent(allowlist))
            return subprocess.run(
                [sys.executable, str(SCRIPT), "--root", str(root), "--allowlist", str(allow)],
                capture_output=True,
                text=True,
            )

    def test_fails_naming_each_untested_variant(self):
        result = self.run_check(LIB, "fn t() {}")
        self.assertEqual(result.returncode, 1)
        self.assertIn("untested: demo Error::NotAuthorized (#1)", result.stderr)
        self.assertIn("untested: demo Error::FeeTooHigh (#2)", result.stderr)

    def test_a_variant_counts_by_name_or_by_code(self):
        tests = """
            #[should_panic(expected = "Error(Contract, #1)")]
            fn a() {}
            fn b() { assert_eq!(r, Err(Ok(Error::FeeTooHigh))); }
        """
        result = self.run_check(LIB, tests)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_a_mention_in_a_comment_does_not_count(self):
        tests = """
            // asserts Error::NotAuthorized and Error(Contract, #2)
            /* Error::FeeTooHigh */
        """
        result = self.run_check(LIB, tests)
        self.assertIn("demo Error::NotAuthorized", result.stderr)
        self.assertIn("demo Error::FeeTooHigh", result.stderr)

    def test_a_code_shared_by_two_enums_needs_the_name(self):
        lib = LIB + "\n#[contracterror]\npub enum Other {\n    Mirror = 1,\n}\n"
        tests = """
            #[should_panic(expected = "Error(Contract, #1)")]
            fn a() {}
            fn b() { Error::FeeTooHigh; Error::NotAuthorized; }
        """
        result = self.run_check(lib, tests)
        self.assertEqual(result.returncode, 1)
        self.assertIn("untested: demo Other::Mirror (#1)", result.stderr)
        self.assertNotIn("Error::NotAuthorized", result.stderr)

    def test_a_reserved_placeholder_is_skipped(self):
        lib = LIB.replace("FeeTooHigh = 2,", "FeeTooHigh = 2,\n    _Reserved = 3,")
        result = self.run_check(lib, "fn b() { Error::FeeTooHigh; Error::NotAuthorized; }")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_an_allowlisted_variant_passes(self):
        result = self.run_check(
            LIB,
            "fn b() { Error::FeeTooHigh; }",
            "# comment\ndemo Error::NotAuthorized  never returned\n",
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_an_allowlist_entry_needs_a_reason(self):
        result = self.run_check(
            LIB, "fn b() { Error::FeeTooHigh; }", "demo Error::NotAuthorized\n"
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("demo Error::NotAuthorized has no reason", result.stderr)

    def test_an_allowlisted_variant_that_is_now_tested_fails(self):
        result = self.run_check(
            LIB,
            "fn b() { Error::FeeTooHigh; Error::NotAuthorized; }",
            "demo Error::NotAuthorized  never returned\n",
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("demo Error::NotAuthorized (#1) is allowlisted but now tested", result.stderr)

    def test_an_allowlist_entry_for_a_missing_variant_fails(self):
        result = self.run_check(
            LIB,
            "fn b() { Error::FeeTooHigh; Error::NotAuthorized; }",
            "demo Error::Gone  removed last release\n",
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("demo Error::Gone is allowlisted but no such variant exists", result.stderr)


if __name__ == "__main__":
    unittest.main()
