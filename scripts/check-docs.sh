#!/usr/bin/env bash
#
# Fail if a contract has a public entry point without rustdoc.
#
# Entry points are functions in a #[contractimpl] block. They must all be
# documented — a deployed contract cannot be patched, so undocumented entry
# points ship permanently.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT_CODE=0

check_contract() {
  local contract_dir="$1"
  local contract_name="$(basename "$contract_dir")"

  # Find lib.rs or contract.rs in the contract directory
  local src_file
  if [[ -f "$contract_dir/src/lib.rs" ]]; then
    src_file="$contract_dir/src/lib.rs"
  elif [[ -f "$contract_dir/src/contract.rs" ]]; then
    src_file="$contract_dir/src/contract.rs"
  else
    echo "warning: No src/lib.rs or src/contract.rs found in $contract_dir"
    return
  fi

  # Find all public functions in #[contractimpl] impl blocks that lack documentation
  # This regex looks for:
  # - Lines matching "pub fn" (public functions)
  # - Within a contractimpl block
  # - That are NOT preceded by a comment starting with ///

  local undocumented=()
  local in_contractimpl=false
  local line_num=0
  local prev_line=""

  while IFS= read -r line; do
    line_num=$((line_num + 1))

    # Track if we're in a contractimpl block
    if [[ "$line" =~ \#\[contractimpl\] ]]; then
      in_contractimpl=true
    fi

    if [[ "$in_contractimpl" == true ]]; then
      # Check for closing brace of impl block (simple heuristic)
      if [[ "$line" =~ ^[[:space:]]*\} ]]; then
        # Check if this might be the end of impl
        if [[ "$prev_line" =~ ^[[:space:]]*\} ]]; then
          in_contractimpl=false
        fi
      fi

      # Look for public functions
      if [[ "$line" =~ ^[[:space:]]*pub[[:space:]]+(async[[:space:]]+)?fn[[:space:]] ]]; then
        # Check if the previous non-empty line is a documentation comment
        local check_line=$((line_num - 1))
        local found_doc=false

        # Simple check: look if the line before has /// or /**
        if [[ "$prev_line" =~ ///|/\*\* ]]; then
          found_doc=true
        fi

        if [[ "$found_doc" == false ]]; then
          # Extract function name
          local func_name=$(echo "$line" | sed 's/.*fn[[:space:]]\+\([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/')
          undocumented+=("line $line_num: $func_name")
        fi
      fi
    fi

    prev_line="$line"
  done < "$src_file"

  if [[ ${#undocumented[@]} -gt 0 ]]; then
    echo "error: $contract_name has undocumented entry points:"
    printf '  %s\n' "${undocumented[@]}"
    EXIT_CODE=1
  fi
}

# Check all contracts
for contract_dir in "$ROOT/contracts"/*; do
  if [[ -d "$contract_dir" && -f "$contract_dir/Cargo.toml" ]]; then
    check_contract "$contract_dir"
  fi
done

exit $EXIT_CODE
