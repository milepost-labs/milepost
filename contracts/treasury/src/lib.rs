#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    token, Address, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAuthorized = 1,
    InvalidThreshold = 2,
    ProposalNotFound = 3,
    ProposalExpired = 4,
    ProposalAlreadyExecuted = 5,
    AlreadyApproved = 6,
    BelowThreshold = 7,
    InvalidSigners = 8,
    InvalidDuration = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Action {
    Transfer { token: Address, to: Address, amount: i128 },
    ChangeConfig { signers: Vec<Address>, threshold: u32 },
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub action: Action,
    pub expires_at: u64,
    pub executed: bool,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Signers,
    Threshold,
    ProposalCount,
    Proposal(u32),
    Approval(u32, Address),
}

#[contractevent(topics = ["proposed"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposed {
    #[topic]
    pub id: u32,
    #[topic]
    pub proposer: Address,
    pub action: Action,
    pub expires_at: u64,
}

#[contractevent(topics = ["approved"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approved {
    #[topic]
    pub id: u32,
    #[topic]
    pub signer: Address,
}

#[contractevent(topics = ["executed"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Executed {
    #[topic]
    pub id: u32,
}

const MAX_DURATION_SECONDS: u64 = 30 * 24 * 60 * 60; // 30 days

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    pub fn __constructor(env: Env, signers: Vec<Address>, threshold: u32) -> Result<(), Error> {
        validate_signers(&env, &signers, threshold)?;
        env.storage().instance().set(&Key::Signers, &signers);
        env.storage().instance().set(&Key::Threshold, &threshold);
        env.storage().instance().set(&Key::ProposalCount, &0u32);
        Ok(())
    }

    pub fn propose(env: Env, proposer: Address, action: Action, duration: u64) -> Result<u32, Error> {
        proposer.require_auth();
        
        let signers = Self::get_signers(&env)?;
        if !signers.contains(&proposer) {
            return Err(Error::NotAuthorized);
        }

        if duration == 0 || duration > MAX_DURATION_SECONDS {
            return Err(Error::InvalidDuration);
        }

        let id: u32 = env.storage().instance().get(&Key::ProposalCount).unwrap_or(0);
        env.storage().instance().set(&Key::ProposalCount, &(id + 1));

        let expires_at = env.ledger().timestamp() + duration;
        let proposal = Proposal {
            action: action.clone(),
            expires_at,
            executed: false,
        };

        let prop_key = Key::Proposal(id);
        env.storage().persistent().set(&prop_key, &proposal);
        
        // Auto-approve by the proposer
        let app_key = Key::Approval(id, proposer.clone());
        env.storage().persistent().set(&app_key, &true);

        Proposed {
            id,
            proposer: proposer.clone(),
            action,
            expires_at,
        }
        .publish(&env);

        Approved {
            id,
            signer: proposer,
        }
        .publish(&env);

        Ok(id)
    }

    pub fn approve(env: Env, signer: Address, id: u32) -> Result<(), Error> {
        signer.require_auth();

        let signers = Self::get_signers(&env)?;
        if !signers.contains(&signer) {
            return Err(Error::NotAuthorized);
        }

        let prop_key = Key::Proposal(id);
        let proposal: Proposal = env
            .storage()
            .persistent()
            .get(&prop_key)
            .ok_or(Error::ProposalNotFound)?;

        if proposal.executed {
            return Err(Error::ProposalAlreadyExecuted);
        }

        if env.ledger().timestamp() >= proposal.expires_at {
            return Err(Error::ProposalExpired);
        }

        let app_key = Key::Approval(id, signer.clone());
        if env.storage().persistent().has(&app_key) {
            return Err(Error::AlreadyApproved);
        }

        env.storage().persistent().set(&app_key, &true);

        Approved {
            id,
            signer,
        }
        .publish(&env);

        Ok(())
    }

    pub fn execute(env: Env, executor: Address, id: u32) -> Result<(), Error> {
        executor.require_auth();

        let prop_key = Key::Proposal(id);
        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&prop_key)
            .ok_or(Error::ProposalNotFound)?;

        if proposal.executed {
            return Err(Error::ProposalAlreadyExecuted);
        }

        if env.ledger().timestamp() >= proposal.expires_at {
            return Err(Error::ProposalExpired);
        }

        let signers = Self::get_signers(&env)?;
        let threshold = Self::get_threshold(&env)?;

        let mut approvals = 0;
        for signer in signers.iter() {
            let app_key = Key::Approval(id, signer.clone());
            if env.storage().persistent().has(&app_key) {
                approvals += 1;
            }
        }

        if approvals < threshold {
            return Err(Error::BelowThreshold);
        }

        proposal.executed = true;
        env.storage().persistent().set(&prop_key, &proposal);

        match &proposal.action {
            Action::Transfer { token, to, amount } => {
                token::Client::new(&env, token).transfer(
                    &env.current_contract_address(),
                    to,
                    amount,
                );
            }
            Action::ChangeConfig { signers: new_signers, threshold: new_threshold } => {
                validate_signers(&env, new_signers, *new_threshold)?;
                env.storage().instance().set(&Key::Signers, new_signers);
                env.storage().instance().set(&Key::Threshold, new_threshold);
            }
        }

        Executed { id }.publish(&env);
        Ok(())
    }

    pub fn get_signers(env: &Env) -> Result<Vec<Address>, Error> {
        env.storage()
            .instance()
            .get(&Key::Signers)
            .ok_or(Error::NotAuthorized)
    }

    pub fn get_threshold(env: &Env) -> Result<u32, Error> {
        env.storage()
            .instance()
            .get(&Key::Threshold)
            .ok_or(Error::NotAuthorized)
    }

    pub fn get_proposal(env: Env, id: u32) -> Result<Proposal, Error> {
        env.storage()
            .persistent()
            .get(&Key::Proposal(id))
            .ok_or(Error::ProposalNotFound)
    }

    pub fn has_approved(env: Env, id: u32, signer: Address) -> bool {
        env.storage().persistent().has(&Key::Approval(id, signer))
    }
}

fn validate_signers(env: &Env, signers: &Vec<Address>, threshold: u32) -> Result<(), Error> {
    if threshold == 0 || threshold > signers.len() {
        return Err(Error::InvalidThreshold);
    }
    let mut unique = Vec::new(env);
    for signer in signers.iter() {
        if unique.contains(&signer) {
            return Err(Error::InvalidSigners);
        }
        unique.push_back(signer);
    }
    Ok(())
}
