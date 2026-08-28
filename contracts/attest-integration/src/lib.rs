#![no_std]

//! # Attestation-gated action — example contract
//!
//! Demonstrates how an *unrelated* contract can gate a privileged action on a
//! valid attestation from the Milepost attestation registry.
//!
//! ## Two traps this example deliberately avoids
//!
//! ### 1. Declaring the interface, not importing the crate
//!
//! Linking the `milepost-attest` crate directly would export **its** symbols
//! from this wasm too. Two contracts exporting the same symbol (e.g.
//! `set_admin`, `register_schema`) produce a module that fails to link.
//!
//! The fix is one line: `#[contractclient(name = "AttestClient")]` on a trait
//! that mirrors only the functions this contract needs. The generated client
//! carries no implementation, so nothing is exported twice.
//!
//! ### 2. `verify` over `is_valid`
//!
//! `is_valid` answers "is this attestation live?" — it does not check *who*
//! made it, *who* it is about, or *which schema* it falls under. A contract
//! gating money on `is_valid` alone accepts a perfectly valid attestation
//! by the wrong party, under the wrong schema, about someone else entirely.
//!
//! `verify` does all three checks in one call and is the only safe default
//! for gating anything of value.

use soroban_sdk::{contract, contractclient, contracterror, contractimpl, Address, BytesN, Env};

/// The slice of the attestation registry this contract needs.
///
/// Declared here rather than imported — see the module doc for why.
#[contractclient(name = "AttestClient")]
pub trait Attestations {
    /// Check that `uid` is a live attestation **by `attester`** about **`subject`**
    /// under **`schema`**. Returns `false` if any of those do not match, if the
    /// attestation has been revoked, or if it has expired.
    fn verify(
        env: Env,
        uid: BytesN<32>,
        subject: Address,
        schema: BytesN<32>,
        attester: Address,
    ) -> bool;
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The attestation did not pass verification.
    AttestationInvalid = 1,
}

#[contract]
pub struct GatedAction;

#[contractimpl]
impl GatedAction {
    /// Perform a privileged action, gated on a valid attestation.
    ///
    /// `attest` is the address of the deployed attestation registry contract.
    /// `schema` is the schema uid this action requires. `attester` is the
    /// party the caller trusts to vouch for the subject.
    ///
    /// Returns `Ok(())` when the attestation is valid and the action may
    /// proceed, or `Err(AttestationInvalid)` otherwise.
    pub fn gated_action(
        env: Env,
        attest: Address,
        uid: BytesN<32>,
        subject: Address,
        schema: BytesN<32>,
        attester: Address,
    ) -> Result<(), Error> {
        let valid = AttestClient::new(&env, &attest).verify(&uid, &subject, &schema, &attester);
        if valid {
            Ok(())
        } else {
            Err(Error::AttestationInvalid)
        }
    }
}

mod test;
