//! Writes the `contractimport!` the tests use to load the built programme.
//!
//! The macro takes only a path literal, resolved against this crate. Written
//! as `../../target/...`, that path finds nothing when cargo-mutants builds in
//! its copy of the workspace, which has no `target/`, so every mutant was
//! unviable. Generating the import here gives it an absolute path instead:
//! `MILEPOST_WASM_DIR` when set (scripts/mutants.sh points it at the checkout's
//! own build), otherwise this workspace's release wasm directory.

use std::{env, fs, path::PathBuf};

const WASM: &str = "milepost_program.wasm";

fn main() {
    println!("cargo:rerun-if-env-changed=MILEPOST_WASM_DIR");
    // Only the host-side tests read the import. Watching the wasm while
    // building the wasm would leave that build never up to date.
    if env::var("TARGET").is_ok_and(|target| target.starts_with("wasm32")) {
        return;
    }
    let dir = env::var_os("MILEPOST_WASM_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
                .join("../../target/wasm32v1-none/release")
        });
    let wasm = dir.join(WASM);
    // Rebuild the tests when the wasm is rebuilt, so they never run a stale one.
    println!("cargo:rerun-if-changed={}", wasm.display());

    let import = format!(
        "soroban_sdk::contractimport!(file = {:?});\n",
        wasm.display().to_string()
    );
    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("import_wasm.rs");
    fs::write(out, import).unwrap();
}
