//! # Cross-contract integration
//!
//! Every other suite tests one contract with its neighbours replaced by
//! something convenient: the programme's suite registers a `FakePolicy`,
//! because a programme only asks whether a policy is installed, and the
//! registry's suite is about the registry. That is the right way to test a
//! contract — a unit test that drags four other contracts in stops being a unit
//! test the first time one of them changes.
//!
//! It does leave the seams untested, and the seams are where this protocol's
//! real properties live. Money the registry collected is only ever paid to an
//! address the programme verified, standing credited under one programme is
//! what the next programme reads, and a programme nobody authorised cannot
//! manufacture a track record for its own recipients. None of that is a
//! property of any single contract; each is a property of the arrangement.
//!
//! So this crate uses no doubles. It deploys the real attest, record, registry
//! and policy-spend contracts, and it instantiates programmes from the **built
//! wasm** through the registry, exactly as a deployment does — so these tests
//! exercise the artifact that ships, not the crate's in-process copy of it.

use milepost_attest::AttestClient;
use milepost_policy_spend::PolicySpendClient;
use milepost_record::RecordClient;
use milepost_registry::{Config, RegistryClient};
use milepost_test_utils::schedule::{
    APPLY_DEADLINE, FEE_BPS, METADATA_HASH_BYTE, RELEASE_DEADLINE, REVIEW_DEADLINE, SWEEP_DEADLINE,
};
use milepost_types::{ProgrammeConfig, Standing};
use soroban_sdk::{
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    vec, Address, BytesN, Env, String, Vec,
};

mod programme {
    //! The programme as it is deployed: its built wasm, not its Rust crate.
    //!
    //! `cargo build --target wasm32v1-none --release` has to run before this
    //! crate compiles, for the same reason it has to before the registry's
    //! tests do — the artefact is the input.
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/milepost_program.wasm");
}
pub use programme::{Client as ProgrammeClient, Error as ProgrammeError, Mode, Phase};

/// The protocol, deployed.
///
/// The addresses are the roles a real deployment separates: a protocol admin who
/// can point the registry at new code, a treasury that receives the fee and
/// unclaimed money, a programme creator, a reviewer who approves awards, and a
/// verifier whose attestations release them. None of them is a privileged
/// operator in the sense of being able to take money — that is the point the
/// tests go on to make.
pub struct Protocol {
    pub env: Env,
    pub admin: Address,
    pub treasury: Address,
    pub creator: Address,
    pub reviewer: Address,
    pub verifier: Address,
    pub attest: AttestClient<'static>,
    pub record: RecordClient<'static>,
    pub registry: RegistryClient<'static>,
    pub policy: PolicySpendClient<'static>,
    pub token: TokenClient<'static>,
    pub mint: StellarAssetClient<'static>,
    pub token_address: Address,
    /// The one schema every programme here is built on: restricted to `verifier`,
    /// so an attestation cannot be made by anyone else.
    pub schema: BytesN<32>,
    pub wasm: BytesN<32>,
    pub config: Config,
}

/// A programme, ready to be driven.
pub struct Deployed {
    pub address: Address,
    pub client: ProgrammeClient<'static>,
}

impl Protocol {
    /// Deploy the whole protocol in the order the deployment scripts use.
    pub fn deploy() -> Protocol {
        let env = milepost_test_utils::new_test_env();

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);
        let reviewer = Address::generate(&env);
        let verifier = Address::generate(&env);

        let attest_id = env.register(milepost_attest::Attest, ());
        let attest = AttestClient::new(&env, &attest_id);
        let schema = attest.register_schema(
            &verifier,
            &String::from_str(&env, "milestone-met:v1"),
            &true,
            &true,
            &None,
        );

        let policy_id = env.register(milepost_policy_spend::PolicySpend, ());
        let policy = PolicySpendClient::new(&env, &policy_id);

        // The record contract starts with the deployer as its admin, because the
        // registry's own address does not exist until it is deployed. Handing it
        // over is the first thing the registry does, and from then on the only
        // way to become a writer is to be deployed by this registry.
        let record_id = env.register(milepost_record::Record, (admin.clone(),));
        let record = RecordClient::new(&env, &record_id);

        let wasm = env.deployer().upload_contract_wasm(programme::WASM);
        let registry_id = env.register(
            milepost_registry::Registry,
            (
                admin.clone(),
                treasury.clone(),
                attest_id,
                record_id,
                policy_id,
                FEE_BPS,
                wasm.clone(),
            ),
        );
        let registry = RegistryClient::new(&env, &registry_id);
        record.set_admin(&registry_id);

        let token_address = milepost_test_utils::register_token(&env);

        Protocol {
            config: registry.get_config(),
            env,
            admin,
            treasury,
            creator,
            reviewer,
            verifier,
            attest,
            record,
            registry,
            policy,
            token: TokenClient::new(&env, &token_address),
            mint: StellarAssetClient::new(&env, &token_address),
            token_address,
            schema,
            wasm,
        }
    }

    /// Create a programme through the registry — the only route that makes a
    /// programme able to write standing.
    pub fn create_programme(&self, tranches: u32) -> Deployed {
        self.create_programme_with(tranches, &vec![&self.env, self.reviewer.clone()])
    }

    /// As [`Protocol::create_programme`], with the review panel spelled out.
    pub fn create_programme_with(&self, tranches: u32, reviewers: &Vec<Address>) -> Deployed {
        let address = self.registry.create(
            &self.creator,
            &self.token_address,
            &self.schema,
            &APPLY_DEADLINE,
            &REVIEW_DEADLINE,
            &RELEASE_DEADLINE,
            &SWEEP_DEADLINE,
            &1,
            &tranches,
            &BytesN::from_array(&self.env, &[METADATA_HASH_BYTE; 32]),
            reviewers,
            &vec![&self.env, self.verifier.clone()],
            &String::from_str(&self.env, "Health worker stipend 2026"),
            &0i128,
        );
        Deployed {
            client: ProgrammeClient::new(&self.env, &address),
            address,
        }
    }

    /// The configuration the registry hands a programme it creates.
    ///
    /// Exposed so a test can deploy the same programme *without* the registry and
    /// see precisely which authority that costs it.
    pub fn programme_config(&self, tranches: u32) -> ProgrammeConfig {
        ProgrammeConfig {
            creator: self.creator.clone(),
            token: self.token_address.clone(),
            treasury: self.config.treasury.clone(),
            attest: self.config.attest.clone(),
            record: self.config.record.clone(),
            policy: self.config.policy.clone(),
            schema: self.schema.clone(),
            fee_bps: self.config.fee_bps,
            apply_deadline: APPLY_DEADLINE,
            review_deadline: REVIEW_DEADLINE,
            release_deadline: RELEASE_DEADLINE,
            sweep_deadline: SWEEP_DEADLINE,
            quorum: 1,
            tranches,
            minimum_award: 0,
            metadata_hash: BytesN::from_array(&self.env, &[METADATA_HASH_BYTE; 32]),
        }
    }

    /// Deploy a programme nobody authorised, from the same wasm and the same
    /// configuration the registry would have used.
    ///
    /// The token, the schema, the record and the policy are all real, and the
    /// constructor's own checks all pass — the schema exists, the verifier is a
    /// verifier. The only thing missing is the registry's approval, which is
    /// exactly what should turn out to matter.
    pub fn deploy_unauthorised_programme(&self, tranches: u32) -> Deployed {
        // The creator deploys it themselves, which is the whole point: a salt of
        // their own choosing cannot collide with the registry's nonce-derived one.
        let address = self
            .env
            .deployer()
            .with_address(
                self.creator.clone(),
                BytesN::from_array(&self.env, &[0u8; 32]),
            )
            .deploy_v2(
                self.wasm.clone(),
                (
                    self.programme_config(tranches),
                    vec![&self.env, self.reviewer.clone()],
                    vec![&self.env, self.verifier.clone()],
                ),
            );
        Deployed {
            client: ProgrammeClient::new(&self.env, &address),
            address,
        }
    }

    /// Mint to an account, the way a donor arrives with money.
    pub fn fund(&self, account: &Address, amount: i128) {
        self.mint.mint(account, &amount);
    }

    /// Contribute `amount` to a programme as `donor`.
    pub fn contribute(&self, programme: &Deployed, donor: &Address, amount: i128) {
        self.fund(donor, amount);
        programme.client.contribute(donor, &amount);
    }

    /// A recipient's standing, or `None` if no tranche has ever reached them.
    pub fn standing(&self, subject: &Address) -> Option<Standing> {
        self.record.try_get(subject).unwrap().ok()
    }
}
