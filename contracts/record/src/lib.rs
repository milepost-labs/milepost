#![no_std]

//! # Recipient standing
//!
//! A portable, non-transferable summary of what a recipient has received and
//! delivered, accumulated across every programme they have taken part in.
//!
//! The point is underwriting. A first-time applicant is expensive to assess; a
//! recipient who has completed six tranches across two programmes, each release
//! backed by an attestation, is much cheaper. Standing is what makes the second
//! application cost less than the first, and it is deliberately readable by any
//! contract — including ones this protocol knows nothing about.
//!
//! ## Aggregates, not a transaction log
//!
//! Standing stores counts and totals, never a list. Two reasons: a growing
//! collection inside one ledger entry costs more to write over time and becomes
//! expensive to restore after archival, and the full history does not need to be
//! on-chain to be trustworthy.
//!
//! Instead each credit folds into `history_root`, a hash chain over every
//! release. An indexer replaying the contract's events can recompute the chain
//! and compare it against the on-chain root — so the detailed history lives
//! off-chain at zero storage cost while remaining impossible to forge or
//! silently edit. Verification is exact, not probabilistic: any divergence in
//! any field of any release produces a different root.
//!
//! ## Non-transferable by construction
//!
//! There is no transfer function, no approval function, and no owner field to
//! reassign. Standing is not a token that happens to have transfers disabled —
//! the capability was never built. Standing belongs to an address because it
//! *describes* that address.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, xdr::ToXdr, Address, Bytes,
    BytesN, Env,
};

/// Re-exported so callers get the same definition this contract writes, rather
/// than a copy that can drift from it.
pub use milepost_types::Standing;

/// Ledgers per day, at the ~5 second close time Stellar targets.
const DAY_IN_LEDGERS: u32 = 17_280;
/// How far ahead persistent entries are pushed whenever they are touched.
const BUMP_LEDGERS: u32 = 90 * DAY_IN_LEDGERS;
/// Only pay to extend when the entry has less than this much life remaining.
const BUMP_THRESHOLD: u32 = 60 * DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The caller is not a registered writer, or is not the admin.
    NotAuthorized = 1,
    /// No standing exists for this address yet.
    NotFound = 2,
    /// Credits must be strictly positive; standing is append-only and cannot be
    /// walked backwards.
    InvalidAmount = 3,
    /// `total_received` would exceed `i128::MAX`.
    Overflow = 4,
    AlreadyWriter = 5,
    NotWriter = 6,
}

#[contractevent(topics = ["credit"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Credited {
    #[topic]
    pub subject: Address,
    #[topic]
    pub programme: Address,
    pub standing: Standing,
}

#[contractevent(topics = ["writer"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WriterChanged {
    #[topic]
    pub writer: Address,
    pub authorized: bool,
}

#[contractevent(topics = ["admin"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminChanged {
    #[topic]
    pub admin: Address,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Admin,
    /// One entry per writer rather than a set inside a single entry, so the
    /// authorised-writer list can grow without any entry growing.
    Writer(Address),
    Standing(Address),
    /// Marks that `subject` has already been credited under `programme`, so
    /// `programmes` counts distinct programmes without storing a list of them.
    Seen(Address, Address),
}

#[contract]
pub struct Record;

#[contractimpl]
impl Record {
    /// `admin` governs which contracts may write standing. In production this is
    /// the protocol registry, which adds each programme it deploys.
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&Key::Admin, &admin);
        AdminChanged { admin }.publish(&env);
    }

    /// Authorise a contract to credit standing. Deliberately restricted: an
    /// unauthorised writer could manufacture a track record out of nothing,
    /// which would make every downstream underwriting decision worthless.
    pub fn add_writer(env: Env, writer: Address) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();

        let key = Key::Writer(writer.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyWriter);
        }
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        WriterChanged {
            writer,
            authorized: true,
        }
        .publish(&env);
        Ok(())
    }

    /// Revoke a writer. Standing already credited is left alone — history is not
    /// rewritten because an issuer was later removed.
    pub fn remove_writer(env: Env, writer: Address) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();

        let key = Key::Writer(writer.clone());
        if !env.storage().persistent().has(&key) {
            return Err(Error::NotWriter);
        }
        env.storage().persistent().remove(&key);

        WriterChanged {
            writer,
            authorized: false,
        }
        .publish(&env);
        Ok(())
    }

    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.storage().instance().set(&Key::Admin, &new_admin);
        AdminChanged { admin: new_admin }.publish(&env);
        Ok(())
    }

    /// Upgrade the record contract itself.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    pub fn is_writer(env: Env, addr: Address) -> bool {
        env.storage().persistent().has(&Key::Writer(addr))
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        Self::admin(&env)
    }

    /// Record a released tranche against `subject`, creating their standing if
    /// this is the first one. `attestation` is the proof that unlocked the
    /// release; it is folded into the hash chain so the off-chain history cannot
    /// later claim a release was backed by different evidence.
    pub fn credit(
        env: Env,
        writer: Address,
        subject: Address,
        programme: Address,
        amount: i128,
        attestation: BytesN<32>,
    ) -> Result<Standing, Error> {
        writer.require_auth();
        if !env.storage().persistent().has(&Key::Writer(writer)) {
            return Err(Error::NotAuthorized);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let now = env.ledger().timestamp();
        let key = Key::Standing(subject.clone());
        let mut standing = env
            .storage()
            .persistent()
            .get::<_, Standing>(&key)
            .unwrap_or(Standing {
                subject: subject.clone(),
                programmes: 0,
                tranches: 0,
                total_received: 0,
                first_seen: now,
                last_updated: now,
                history_root: BytesN::from_array(&env, &[0u8; 32]),
            });

        // Counted once per programme. The marker is its own tiny entry, which
        // keeps `programmes` accurate without ever storing the list itself.
        let seen = Key::Seen(subject.clone(), programme.clone());
        if !env.storage().persistent().has(&seen) {
            env.storage().persistent().set(&seen, &true);
            env.storage()
                .persistent()
                .extend_ttl(&seen, BUMP_THRESHOLD, BUMP_LEDGERS);
            standing.programmes += 1;
        }

        standing.total_received = standing
            .total_received
            .checked_add(amount)
            .ok_or(Error::Overflow)?;
        standing.tranches += 1;
        standing.last_updated = now;
        standing.history_root = Self::fold(
            &env,
            &standing.history_root,
            &programme,
            amount,
            &attestation,
            now,
        );

        env.storage().persistent().set(&key, &standing);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        Credited {
            subject,
            programme,
            standing: standing.clone(),
        }
        .publish(&env);
        Ok(standing)
    }

    pub fn get(env: Env, subject: Address) -> Result<Standing, Error> {
        let key = Key::Standing(subject);
        let standing: Standing = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
        Ok(standing)
    }

    /// Recompute what `history_root` becomes after one more credit. Lets an
    /// indexer, or anyone auditing a claimed history, verify off-chain records
    /// against on-chain state without trusting the indexer.
    pub fn next_root(
        env: Env,
        root: BytesN<32>,
        programme: Address,
        amount: i128,
        attestation: BytesN<32>,
        timestamp: u64,
    ) -> BytesN<32> {
        Self::fold(&env, &root, &programme, amount, &attestation, timestamp)
    }

    /// Push a recipient's standing further from archival. Permissionless: a
    /// track record is the recipient's asset, and anyone willing to pay the fee
    /// may keep it alive — including the recipient themselves.
    pub fn keepalive(env: Env, subject: Address) -> Result<(), Error> {
        let key = Key::Standing(subject);
        if !env.storage().persistent().has(&key) {
            return Err(Error::NotFound);
        }
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
        Ok(())
    }

    fn fold(
        env: &Env,
        root: &BytesN<32>,
        programme: &Address,
        amount: i128,
        attestation: &BytesN<32>,
        timestamp: u64,
    ) -> BytesN<32> {
        let mut preimage = Bytes::new(env);
        preimage.append(&root.clone().into());
        preimage.append(&programme.clone().to_xdr(env));
        preimage.append(&Bytes::from_array(env, &amount.to_be_bytes()));
        preimage.append(&attestation.clone().into());
        preimage.append(&Bytes::from_array(env, &timestamp.to_be_bytes()));
        env.crypto().sha256(&preimage).into()
    }

    fn admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&Key::Admin)
            .ok_or(Error::NotAuthorized)
    }
}

#[cfg(test)]
mod test;
