#![no_std]

//! # Attestation registry
//!
//! A general-purpose, schema-based attestation registry. An *attester* makes a
//! signed claim about a *subject* under a registered *schema*; consumers later
//! ask whether that claim is still valid.
//!
//! Soroban has no equivalent of Ethereum's EAS, so this is deliberately built as
//! a standalone contract with no knowledge of the rest of the protocol. Milepost
//! uses it to gate tranche releases — a clinic attesting shifts worked, a school
//! attesting enrolment, a co-op attesting delivery — but nothing here is
//! specific to that.
//!
//! ## Why there are no on-chain lists
//!
//! The registry never stores "all attestations for a subject". Growing a
//! collection inside a single ledger entry makes writes cost more over time and
//! eventually makes the entry unrestorable after archival. Instead every
//! attestation gets a content-addressed id, listing is served off-chain from
//! events, and consumers verify a *specific* id on-chain via [`Attest::get`] —
//! checking for themselves that the subject, schema and attester are the ones
//! they expected.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, xdr::ToXdr, Address, Bytes,
    BytesN, Env, String,
};

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
    SchemaNotFound = 1,
    SchemaAlreadyExists = 2,
    AttestationNotFound = 3,
    NotRevocable = 4,
    NotAttester = 5,
    AlreadyRevoked = 6,
    ExpiryInPast = 7,
    /// The schema restricts who may attest, and this attester is not on the list.
    AttesterNotAuthorized = 8,
    /// A cycle was detected in the schema predecessor chain.
    CycleDetected = 9,
}

/// A claim template. `definition` is an opaque, human-readable description of
/// what the claim means and how `data_hash` should be interpreted — the registry
/// never parses it.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Schema {
    pub uid: BytesN<32>,
    /// Who registered the schema. Only meaningful when `restricted` is set.
    pub authority: Address,
    pub definition: String,
    /// Whether attestations under this schema may later be revoked.
    pub revocable: bool,
    /// Whether `restricted` is set, only `authority` may attest under this schema.
    pub restricted: bool,
    /// The uid of the predecessor schema, if any. Only the authority may set this.
    pub predecessor: Option<BytesN<32>>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub uid: BytesN<32>,
    pub schema: BytesN<32>,
    pub attester: Address,
    /// Who the claim is *about*.
    pub subject: Address,
    /// Hash of the off-chain payload. Kept as a hash so the registry stays cheap
    /// and the payload can live anywhere the parties agree on.
    pub data_hash: BytesN<32>,
    pub created_at: u64,
    /// Unix seconds after which the claim no longer counts as valid. `None`
    /// means it never expires on its own.
    pub expires_at: Option<u64>,
    /// `None` until withdrawn. Deliberately not a `0` sentinel: the ledger
    /// timestamp is genuinely `0` early on, which would make the first
    /// revocation indistinguishable from no revocation at all.
    pub revoked_at: Option<u64>,
}

/// Emitted on every state change. Off-chain indexers reconstruct "all
/// attestations for this subject" from these, which is why the contract itself
/// never keeps such a list.
#[contractevent(topics = ["schema"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SchemaRegistered {
    #[topic]
    pub uid: BytesN<32>,
    pub schema: Schema,
}

#[contractevent(topics = ["attest"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attested {
    #[topic]
    pub subject: Address,
    #[topic]
    pub uid: BytesN<32>,
    pub attestation: Attestation,
}

#[contractevent(topics = ["revoke"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Revoked {
    #[topic]
    pub uid: BytesN<32>,
    pub revoked_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Schema(BytesN<32>),
    Attestation(BytesN<32>),
    /// Monotonic counter, only used to keep attestation ids unique when the same
    /// attester makes the same claim about the same subject twice.
    Nonce,
}

#[contract]
pub struct Attest;

#[contractimpl]
impl Attest {
    /// Register a claim template. The returned id is derived from the
    /// definition and authority, so registering identical input twice is an
    /// error rather than a silent duplicate.
    pub fn register_schema(
        env: Env,
        authority: Address,
        definition: String,
        revocable: bool,
        restricted: bool,
        predecessor: Option<BytesN<32>>,
    ) -> Result<BytesN<32>, Error> {
        authority.require_auth();

        // Compute the schema uid first (from authority + definition).
        let mut preimage = Bytes::new(&env);
        preimage.append(&authority.clone().to_xdr(&env));
        preimage.append(&definition.clone().to_xdr(&env));
        let uid: BytesN<32> = env.crypto().sha256(&preimage).into();

        // Only the authority may declare a predecessor.
        // Reject cycles by walking the predecessor chain.
        if let Some(ref pred_uid) = predecessor {
            let schema = Self::schema(&env, pred_uid)?;
            if schema.authority != authority {
                return Err(Error::AttesterNotAuthorized);
            }
            // Check for cycles: the new schema's uid must not appear in the predecessor chain.
            Self::check_cycle(&env, pred_uid, &uid)?;
        }

        let key = Key::Schema(uid.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::SchemaAlreadyExists);
        }

        let schema = Schema {
            uid: uid.clone(),
            authority,
            definition,
            revocable,
            restricted,
            predecessor,
        };
        env.storage().persistent().set(&key, &schema);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        SchemaRegistered {
            uid: uid.clone(),
            schema,
        }
        .publish(&env);
        Ok(uid)
    }

    fn check_cycle(env: &Env, start: &BytesN<32>, target: &BytesN<32>) -> Result<(), Error> {
        // Walk the predecessor chain from `start` to detect if `target` appears in it.
        // Limit depth to prevent infinite loops; schema chains should be shallow.
        let mut current = start.clone();
        for _ in 0..64usize {
            if current == *target {
                return Err(Error::CycleDetected);
            }
            match Self::schema(env, &current)?.predecessor {
                Some(pred) => current = pred,
                None => return Ok(()),
            }
        }
        Ok(())
    }

    /// Make a claim about `subject`. Returns the attestation id that consumers
    /// will later verify.
    pub fn attest(
        env: Env,
        attester: Address,
        schema_uid: BytesN<32>,
        subject: Address,
        data_hash: BytesN<32>,
        expires_at: Option<u64>,
    ) -> Result<BytesN<32>, Error> {
        attester.require_auth();

        let schema = Self::schema(&env, &schema_uid)?;
        if schema.restricted && schema.authority != attester {
            return Err(Error::AttesterNotAuthorized);
        }

        let now = env.ledger().timestamp();
        if let Some(deadline) = expires_at {
            if deadline <= now {
                return Err(Error::ExpiryInPast);
            }
        }

        let nonce: u64 = env.storage().instance().get(&Key::Nonce).unwrap_or(0);
        env.storage().instance().set(&Key::Nonce, &(nonce + 1));

        let mut preimage = Bytes::new(&env);
        preimage.append(&schema_uid.clone().into());
        preimage.append(&attester.clone().to_xdr(&env));
        preimage.append(&subject.clone().to_xdr(&env));
        preimage.append(&Bytes::from_array(&env, &nonce.to_be_bytes()));
        let uid: BytesN<32> = env.crypto().sha256(&preimage).into();

        let attestation = Attestation {
            uid: uid.clone(),
            schema: schema_uid,
            attester,
            subject: subject.clone(),
            data_hash,
            created_at: now,
            expires_at,
            revoked_at: None,
        };

        let key = Key::Attestation(uid.clone());
        env.storage().persistent().set(&key, &attestation);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        Attested {
            subject,
            uid: uid.clone(),
            attestation,
        }
        .publish(&env);
        Ok(uid)
    }

    /// Withdraw a claim. Only the original attester may revoke, and only if the
    /// schema allowed it. Revocation is recorded rather than deleted so the
    /// history stays auditable.
    pub fn revoke(env: Env, attester: Address, uid: BytesN<32>) -> Result<(), Error> {
        attester.require_auth();

        let mut attestation = Self::attestation(&env, &uid)?;
        if attestation.attester != attester {
            return Err(Error::NotAttester);
        }
        if attestation.revoked_at.is_some() {
            return Err(Error::AlreadyRevoked);
        }
        if !Self::schema(&env, &attestation.schema)?.revocable {
            return Err(Error::NotRevocable);
        }

        let revoked_at = env.ledger().timestamp();
        attestation.revoked_at = Some(revoked_at);
        let key = Key::Attestation(uid.clone());
        env.storage().persistent().set(&key, &attestation);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);

        Revoked { uid, revoked_at }.publish(&env);
        Ok(())
    }

    /// Fetch a claim. Callers gating value on this **must** check `subject`,
    /// `schema` and `attester` against what they expected — a valid attestation
    /// by the wrong party is still a valid attestation.
    pub fn get(env: Env, uid: BytesN<32>) -> Result<Attestation, Error> {
        Self::attestation(&env, &uid)
    }

    pub fn get_schema(env: Env, uid: BytesN<32>) -> Result<Schema, Error> {
        Self::schema(&env, &uid)
    }

    /// The check a contract gating value should actually use.
    ///
    /// [`Attest::is_valid`] deliberately says nothing about who made a claim or
    /// what it was about, so using it alone accepts a perfectly valid
    /// attestation by the wrong party, under the wrong schema, about someone
    /// else entirely. Rather than trust every caller to remember all three
    /// comparisons, this does them here, in one call.
    pub fn verify(
        env: Env,
        uid: BytesN<32>,
        subject: Address,
        schema: BytesN<32>,
        attester: Address,
    ) -> bool {
        match Self::attestation(&env, &uid) {
            Ok(a) => {
                let now = env.ledger().timestamp();
                a.revoked_at.is_none()
                    && a.expires_at.is_none_or(|at| at > now)
                    && a.subject == subject
                    && a.schema == schema
                    && a.attester == attester
            }
            Err(_) => false,
        }
    }

    /// Whether the claim exists, has not been revoked, and has not expired.
    /// Says nothing about *who* made it or what it was about — prefer
    /// [`Attest::verify`] when gating anything of value.
    pub fn is_valid(env: Env, uid: BytesN<32>) -> bool {
        match Self::attestation(&env, &uid) {
            Ok(a) => {
                let now = env.ledger().timestamp();
                a.revoked_at.is_none() && a.expires_at.is_none_or(|at| at > now)
            }
            Err(_) => false,
        }
    }

    /// Push a stored attestation's archival deadline further out. Permissionless
    /// by design: a recipient's proof should not rot because the issuer lost
    /// interest, and anyone willing to pay the fee may keep it alive.
    pub fn keepalive(env: Env, uid: BytesN<32>) -> Result<(), Error> {
        let key = Key::Attestation(uid);
        if !env.storage().persistent().has(&key) {
            return Err(Error::AttestationNotFound);
        }
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
        Ok(())
    }

    fn schema(env: &Env, uid: &BytesN<32>) -> Result<Schema, Error> {
        let key = Key::Schema(uid.clone());
        let schema: Schema = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::SchemaNotFound)?;
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
        Ok(schema)
    }

    fn attestation(env: &Env, uid: &BytesN<32>) -> Result<Attestation, Error> {
        env.storage()
            .persistent()
            .get(&Key::Attestation(uid.clone()))
            .ok_or(Error::AttestationNotFound)
    }
}

#[cfg(test)]
mod test;
