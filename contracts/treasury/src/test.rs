#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, Env, IntoVal, String, Val, Vec, vec,
};

fn setup_test(env: &Env, signers: Vec<Address>, threshold: u32) -> TreasuryClient<'static> {
    let contract_id = env.register(Treasury, (signers, threshold));
    TreasuryClient::new(env, &contract_id)
}

#[test]
fn test_propose_approve_execute_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let receiver = Address::generate(&env);

    let signers = vec![&env, signer1.clone(), signer2.clone(), signer3.clone()];
    let client = setup_test(&env, signers, 2);

    // Register dummy token
    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let token = token::Client::new(&env, &asset.address());
    let mint = token::StellarAssetClient::new(&env, &asset.address());

    // Mint some tokens to the treasury
    mint.mint(&client.address, &1000);
    assert_eq!(token.balance(&client.address), 1000);

    // Propose transfer
    let action = Action::Transfer {
        token: asset.address(),
        to: receiver.clone(),
        amount: 400,
    };
    
    let id = client.propose(&signer1, &action, &3600);
    assert_eq!(id, 0);

    // signer1 automatically approved it, so approval count is 1. threshold is 2.
    // Try executing -> should fail with below threshold
    assert_eq!(client.try_execute(&signer1, &id), Err(Ok(Error::BelowThreshold)));

    // Approve by signer2
    client.approve(&signer2, &id);

    // Try approving again by signer2 -> should fail with already approved
    assert_eq!(client.try_approve(&signer2, &id), Err(Ok(Error::AlreadyApproved)));

    // Try approving by a non-signer -> should fail with not authorized
    let stranger = Address::generate(&env);
    assert_eq!(client.try_approve(&stranger, &id), Err(Ok(Error::NotAuthorized)));

    // Execute the proposal
    client.execute(&signer1, &id);

    // Check balances
    assert_eq!(token.balance(&client.address), 600);
    assert_eq!(token.balance(&receiver), 400);

    // Try executing again -> should fail with already executed
    assert_eq!(client.try_execute(&signer1, &id), Err(Ok(Error::ProposalAlreadyExecuted)));
}

#[test]
fn test_expiration() {
    let env = Env::default();
    env.mock_all_auths();

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signers = vec![&env, signer1.clone(), signer2.clone()];
    let client = setup_test(&env, signers, 2);

    let action = Action::Transfer {
        token: Address::generate(&env),
        to: Address::generate(&env),
        amount: 400,
    };

    let id = client.propose(&signer1, &action, &3600);
    client.approve(&signer2, &id);

    // Advance time past expiration
    env.ledger().set(LedgerInfo {
        timestamp: 4000,
        protocol_version: 21,
        sequence_number: 1,
        network_id: [0; 32],
        base_reserve: 0,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: 100,
    });

    // Try executing -> should fail with expired
    assert_eq!(client.try_execute(&signer1, &id), Err(Ok(Error::ProposalExpired)));

    // Try approving -> should fail with expired
    let signer3 = Address::generate(&env);
    assert_eq!(client.try_approve(&signer3, &id), Err(Ok(Error::ProposalExpired)));
}

#[test]
fn test_change_config() {
    let env = Env::default();
    env.mock_all_auths();

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signers = vec![&env, signer1.clone(), signer2.clone()];
    let client = setup_test(&env, signers, 2);

    let new_signer = Address::generate(&env);
    let new_signers = vec![&env, signer1.clone(), new_signer.clone()];
    
    let action = Action::ChangeConfig {
        signers: new_signers.clone(),
        threshold: 1,
    };

    let id = client.propose(&signer1, &action, &3600);
    client.approve(&signer2, &id);
    client.execute(&signer1, &id);

    // Check config
    assert_eq!(client.get_signers(), new_signers);
    assert_eq!(client.get_threshold(), 1);

    // Signer2 is no longer a signer, so try proposing should fail
    let action2 = Action::Transfer {
        token: Address::generate(&env),
        to: Address::generate(&env),
        amount: 100,
    };
    assert_eq!(client.try_propose(&signer2, &action2, &3600), Err(Ok(Error::NotAuthorized)));

    // New signer should be able to propose and immediately execute (threshold is now 1)
    let id2 = client.propose(&new_signer, &action2, &3600);
    client.execute(&new_signer, &id2);
}
