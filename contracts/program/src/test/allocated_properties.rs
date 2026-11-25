//! Property tests for `Allocated` escrow (#680).
//!
//! In `Allocated` mode a released tranche never leaves the contract: it lands in
//! the recipient's escrow (`allocation_of`) and the recipient directs it to
//! verified payees with `spend`, in any amounts, any number of times. The unit
//! tests check single spends. These run random sequences of releases and spends
//! against one award, valid and invalid mixed together, and after **every**
//! step check:
//!
//! 1. `allocation_of` is never negative;
//! 2. what has been spent plus what is still escrowed equals what has been
//!    released into escrow, so escrow is neither created nor lost;
//! 3. every payee holds exactly what was spent to them, and nobody else
//!    (the recipient, an unverified address) received anything;
//! 4. a step the contract refused changed nothing at all.
//!
//! On top of those, the award itself bounds everything: nothing released or
//! spent ever exceeds `granted`.
//!
//! Each step also has its outcome predicted from a model and compared with the
//! contract's answer, error code included. A step that "fails for some reason"
//! is not good enough: an over-spend that came back `PayeeNotVerified` would
//! hide a missing allocation check.

extern crate std;

use super::*;
use proptest::prelude::*;
use std::vec::Vec as StdVec;

/// Who a spend is addressed to. Three verified payees, so the property sees
/// money split across destinations, and one address the creator never
/// verified.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Payee {
    School,
    Clinic,
    Bookshop,
    Unverified,
}

impl Payee {
    const ALL: [Payee; 4] = [
        Payee::School,
        Payee::Clinic,
        Payee::Bookshop,
        Payee::Unverified,
    ];
}

/// How much a spend asks for, relative to what is in escrow when it runs. Named
/// rather than a raw number so a shrunk failure reads as "spent everything" or
/// "spent one more than the allocation" instead of an opaque amount.
#[derive(Clone, Copy, Debug)]
enum Amount {
    /// This percentage of the current allocation, rounded down. Can come out
    /// as zero, which the contract must refuse.
    Percent(u8),
    /// Exactly the current allocation.
    All,
    /// The current allocation plus this much, which must always be refused.
    MoreThanAllocated(u16),
    Zero,
    Negative,
}

#[derive(Clone, Debug)]
enum Step {
    /// Release the next tranche against a fresh, valid proof.
    Release,
    /// Try to release again with a proof that already unlocked a tranche.
    ReplayProof,
    /// The recipient directs part of their escrow to a payee.
    Spend(Payee, Amount),
    /// Someone with no award tries to spend the recipient's escrow under
    /// their own name.
    StrangerSpends(Amount),
    /// Move the clock to the release deadline: releases close, spends do not.
    CloseReleaseWindow,
    /// Move the clock to the sweep deadline: spends close too.
    CloseSpendWindow,
}

fn amount() -> impl Strategy<Value = Amount> {
    prop_oneof![
        6 => (1u8..=100).prop_map(Amount::Percent),
        2 => Just(Amount::All),
        1 => (1u16..=1_000).prop_map(Amount::MoreThanAllocated),
        1 => Just(Amount::Zero),
        1 => Just(Amount::Negative),
    ]
}

fn step() -> impl Strategy<Value = Step> {
    prop_oneof![
        6 => Just(Step::Release),
        1 => Just(Step::ReplayProof),
        10 => (prop::sample::select(Payee::ALL.to_vec()), amount())
            .prop_map(|(p, a)| Step::Spend(p, a)),
        1 => amount().prop_map(Step::StrangerSpends),
        1 => Just(Step::CloseReleaseWindow),
        1 => Just(Step::CloseSpendWindow),
    ]
}

/// What the test believes the contract's escrow looks like, built only from
/// what the steps did. The contract is checked against this, not against
/// itself.
struct Model {
    granted: i128,
    tranches: u32,
    tranches_released: u32,
    /// Sum of every tranche released into escrow.
    released: i128,
    /// Sum of every successful spend.
    spent: i128,
    /// What each payee in [`Payee::ALL`] order has been paid.
    paid: [i128; 4],
}

impl Model {
    fn escrow(&self) -> i128 {
        self.released - self.spent
    }

    /// What the contract's own tranche rule pays on the next release.
    fn next_tranche(&self) -> i128 {
        if self.tranches_released + 1 == self.tranches {
            self.granted - self.released
        } else {
            self.granted / self.tranches as i128
        }
    }
}

struct World {
    f: Fixture,
    recipient: Address,
    stranger: Address,
    payees: [Address; 4],
    /// Proofs that have unlocked a tranche, for `ReplayProof`.
    used: StdVec<BytesN<32>>,
    /// Distinguishes each fresh proof's payload so it gets its own uid.
    next_proof: u8,
}

impl World {
    fn new(granted: i128, tranches: u32) -> Self {
        let f = setup_with(1, 1, tranches);
        let recipient = Address::generate(&f.env);
        let stranger = Address::generate(&f.env);
        let payees = [
            Address::generate(&f.env),
            Address::generate(&f.env),
            Address::generate(&f.env),
            Address::generate(&f.env),
        ];
        // Every payee except `Unverified`.
        for p in &payees[..3] {
            f.client.allow_payee(p);
        }

        // Fund well beyond the award so the budget never decides anything here.
        f.client
            .contribute(&funded_donor(&f, granted * 2), &(granted * 2));
        f.client.apply(&recipient, &granted, &hash(&f.env, 1));
        to_review(&f);
        f.client
            .review(&f.reviewers.get(0).unwrap(), &recipient, &granted);
        let award = f.client.finalize(&recipient, &recipient, &Mode::Allocated);
        assert_eq!(award.granted, granted);
        assert_eq!(award.mode, Mode::Allocated);

        World {
            f,
            recipient,
            stranger,
            payees,
            used: StdVec::new(),
            next_proof: 10,
        }
    }

    fn payee(&self, p: Payee) -> &Address {
        &self.payees[Payee::ALL.iter().position(|&q| q == p).unwrap()]
    }

    /// Everything a step could change. A refused step must leave this
    /// byte-for-byte identical.
    fn snapshot(&self) -> (i128, i128, i128, i128, i128, [i128; 4], Award) {
        let c = &self.f.client;
        let t = &self.f.token;
        (
            c.allocation_of(&self.recipient),
            c.allocation_of(&self.stranger),
            c.total_released(),
            t.balance(&c.address),
            t.balance(&self.recipient),
            [
                t.balance(&self.payees[0]),
                t.balance(&self.payees[1]),
                t.balance(&self.payees[2]),
                t.balance(&self.payees[3]),
            ],
            c.get_award(&self.recipient),
        )
    }

    fn resolve(&self, amount: Amount, escrow: i128) -> i128 {
        match amount {
            Amount::Percent(p) => escrow * p as i128 / 100,
            Amount::All => escrow,
            Amount::MoreThanAllocated(n) => escrow + n as i128,
            Amount::Zero => 0,
            Amount::Negative => -1,
        }
    }

    /// The error `spend` must return, in the order the contract checks, or
    /// `None` if it must succeed.
    fn expected_spend_error(&self, payee: Payee, amount: i128, escrow: i128) -> Option<Error> {
        if self.f.env.ledger().timestamp() >= SWEEP_DEADLINE {
            Some(Error::SpendWindowClosed)
        } else if amount <= 0 {
            Some(Error::InvalidAmount)
        } else if payee == Payee::Unverified {
            Some(Error::PayeeNotVerified)
        } else if escrow < amount {
            Some(Error::InsufficientAllocation)
        } else {
            None
        }
    }

    fn expected_release_error(&self, m: &Model) -> Option<Error> {
        if self.f.env.ledger().timestamp() >= RELEASE_DEADLINE {
            Some(Error::ReleaseWindowClosed)
        } else if m.tranches_released >= m.tranches {
            Some(Error::AwardFullyReleased)
        } else {
            None
        }
    }

    /// Run one step, check its outcome against the model, and advance the
    /// model if it succeeded. Returns whether it succeeded.
    fn apply(&mut self, step: &Step, m: &mut Model) -> bool {
        let c = &self.f.client;
        match *step {
            Step::Release => {
                // Mint the proof before the expected error is worked out, so a
                // refusal can only be about the award or the window.
                let uid = proof(&self.f, &self.recipient, self.next_proof);
                self.next_proof += 1;
                let expected = self.expected_release_error(m);
                let got = c.try_release(&self.recipient, &uid, &self.f.verifier);
                match expected {
                    None => {
                        let tranche = m.next_tranche();
                        assert_eq!(got, Ok(Ok(tranche)), "{step:?}");
                        m.tranches_released += 1;
                        m.released += tranche;
                        self.used.push(uid);
                        true
                    }
                    Some(e) => {
                        assert_eq!(got, Err(Ok(e)), "{step:?}");
                        false
                    }
                }
            }
            Step::ReplayProof => {
                let Some(uid) = self.used.last().cloned() else {
                    return false; // nothing released yet, so nothing to replay
                };
                // Replaying a spent proof must never pay again. The window check
                // runs first, so after the deadline the refusal says so instead.
                let expected = if self.f.env.ledger().timestamp() >= RELEASE_DEADLINE {
                    Error::ReleaseWindowClosed
                } else {
                    Error::AttestationAlreadyUsed
                };
                assert_eq!(
                    c.try_release(&self.recipient, &uid, &self.f.verifier),
                    Err(Ok(expected)),
                    "{step:?}"
                );
                false
            }
            Step::Spend(payee, amount) => {
                let escrow = m.escrow();
                let amount = self.resolve(amount, escrow);
                let expected = self.expected_spend_error(payee, amount, escrow);
                let got = c.try_spend(&self.recipient, self.payee(payee), &amount);
                match expected {
                    None => {
                        assert_eq!(got, Ok(Ok(escrow - amount)), "{step:?} of {amount}");
                        m.spent += amount;
                        m.paid[Payee::ALL.iter().position(|&q| q == payee).unwrap()] += amount;
                        true
                    }
                    Some(e) => {
                        assert_eq!(got, Err(Ok(e)), "{step:?} of {amount}");
                        false
                    }
                }
            }
            Step::StrangerSpends(amount) => {
                // The stranger has no escrow, whatever the recipient holds.
                let amount = self.resolve(amount, m.escrow());
                let expected = self
                    .expected_spend_error(Payee::School, amount, 0)
                    .expect("a stranger has no escrow, so no spend can succeed");
                assert_eq!(
                    c.try_spend(&self.stranger, self.payee(Payee::School), &amount),
                    Err(Ok(expected)),
                    "{step:?} of {amount}"
                );
                false
            }
            Step::CloseReleaseWindow => {
                let now = self.f.env.ledger().timestamp();
                self.f.env.ledger().set_timestamp(now.max(RELEASE_DEADLINE));
                false
            }
            Step::CloseSpendWindow => {
                self.f.env.ledger().set_timestamp(SWEEP_DEADLINE);
                false
            }
        }
    }

    fn assert_invariants(&self, m: &Model, after: &dyn core::fmt::Debug) {
        let c = &self.f.client;
        let t = &self.f.token;
        let allocation = c.allocation_of(&self.recipient);

        // 1. Escrow is never negative.
        assert!(
            allocation >= 0,
            "after {after:?}: allocation {allocation} < 0"
        );

        // 2. Spent plus escrowed is what was released into escrow, and the
        //    contract's own record of releases agrees with the model's.
        let award = c.get_award(&self.recipient);
        assert_eq!(
            award.released, m.released,
            "after {after:?}: award.released"
        );
        assert_eq!(
            c.total_released(),
            m.released,
            "after {after:?}: total_released"
        );
        assert_eq!(
            m.spent + allocation,
            award.released,
            "after {after:?}: spent {} + allocation {allocation} != released {}",
            m.spent,
            award.released
        );

        // 3. Payees hold exactly what was spent to them. The unverified
        //    address and the recipient never receive anything: in this mode
        //    the money goes from escrow to a verified payee or nowhere.
        for (i, p) in self.payees.iter().enumerate() {
            assert_eq!(
                t.balance(p),
                m.paid[i],
                "after {after:?}: {:?} balance",
                Payee::ALL[i]
            );
        }
        assert_eq!(m.paid[3], 0, "the model paid an unverified payee");
        assert_eq!(t.balance(&self.recipient), 0, "after {after:?}: recipient");
        assert_eq!(
            c.allocation_of(&self.stranger),
            0,
            "after {after:?}: stranger"
        );

        // The award bounds everything.
        assert!(
            award.released <= award.granted,
            "after {after:?}: over-released"
        );
        assert!(m.spent <= award.granted, "after {after:?}: over-spent");
        assert_eq!(
            m.paid.iter().sum::<i128>(),
            m.spent,
            "after {after:?}: payees received something other than what was spent"
        );
    }
}

fn run(granted: i128, tranches: u32, steps: &[Step]) {
    let mut w = World::new(granted, tranches);
    let mut m = Model {
        granted,
        tranches,
        tranches_released: 0,
        released: 0,
        spent: 0,
        paid: [0; 4],
    };
    w.assert_invariants(&m, &"setup");

    for step in steps {
        let before = w.snapshot();
        let ok = w.apply(step, &mut m);
        // 4. A refused step changed nothing.
        if !ok {
            assert_eq!(w.snapshot(), before, "refused {step:?} changed state");
        }
        w.assert_invariants(&m, step);
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    #[test]
    fn allocated_escrow_never_pays_out_more_than_was_awarded(
        granted in 1i128..=1_000_000,
        tranches in 1u32..=6,
        steps in prop::collection::vec(step(), 1..=40),
    ) {
        run(granted, tranches, &steps);
    }
}

/// The edge the random sequences hit only by luck: every tranche released,
/// then the whole escrow drained to the stroop across payees, then one more
/// stroop asked for.
#[test]
fn allocated_escrow_drains_exactly_and_no_further() {
    run(
        1_000,
        3,
        &[
            Step::Release,
            Step::Spend(Payee::School, Amount::Percent(33)),
            Step::Release,
            Step::Release,
            Step::Release, // a fourth tranche does not exist
            Step::Spend(Payee::Clinic, Amount::Percent(50)),
            Step::Spend(Payee::Bookshop, Amount::All),
            Step::Spend(Payee::School, Amount::MoreThanAllocated(1)),
            Step::ReplayProof,
            Step::Spend(Payee::Unverified, Amount::All),
        ],
    );
}
