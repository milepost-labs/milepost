//! Property test: no money is created or lost over a programme's life (#681).
//!
//! Every stroop that enters a programme has to leave it exactly once: to a
//! recipient or payee, back to a donor, or to the treasury. The other suites
//! check pieces of that (refunds never exceed the pool, finalize never exceeds
//! the budget). This one runs a whole random life end to end — several donors
//! and applicants, votes, finalisations in every mode, single and batched
//! releases, spends from escrow, then either a cancellation or the deadlines
//! running out, refunds (full, partial, and never claimed), and both sweeps —
//! and keeps the books after every single call.
//!
//! The books are kept from the **outside**: what donors, recipients, payees,
//! wallets and the treasury actually hold, not what the contract says it did.
//! The contract's own totals are then checked against those balances, so a
//! total that drifted from the money it describes fails here too.

extern crate std;

use super::*;
use proptest::prelude::*;
use std::{format, string::String as StdString, vec::Vec as StdVec};

const MAX_DONORS: usize = 5;
const MAX_APPLICANTS: usize = 4;

#[derive(Clone, Copy, Debug)]
enum Ending {
    /// Cancelled while contributions are still open, so nothing is ever awarded.
    CancelledWhileOpen,
    /// Cancelled after awards are made but before any tranche is released —
    /// the latest point `cancel` allows.
    CancelledAfterAwards,
    /// Never cancelled: the release window closes, refunds open on the
    /// deadline, and the sweep collects what nobody claimed.
    Natural,
}

/// When `sweep_fee` is called, if at all.
#[derive(Clone, Copy, Debug)]
enum FeeSweep {
    DuringReview,
    AfterReleaseWindow,
    /// Left for `sweep_unclaimed` to collect along with everything else.
    Never,
}

#[derive(Clone, Debug)]
struct Applicant {
    requested: i128,
    /// Each reviewer approves this percentage of `requested` (at least 1).
    votes: [u8; 2],
    mode: Mode,
    /// Whether `finalize` is attempted. It can still be refused for budget.
    finalize: bool,
    /// `Restricted` only: whether the wallet has the policy installed. Without
    /// it every release is refused, and must roll back cleanly.
    policy_installed: bool,
}

#[derive(Clone, Copy, Debug)]
enum Payout {
    School,
    Clinic,
}

#[derive(Clone, Debug)]
enum ReleaseStep {
    Release {
        applicant: usize,
    },
    /// Batched release of up to `proofs` tranches, sized to what remains.
    ReleaseBatch {
        applicant: usize,
        proofs: u8,
    },
    Spend {
        applicant: usize,
        to: Payout,
        percent: u8,
    },
}

#[derive(Clone, Debug)]
enum RefundStep {
    Refund {
        donor: usize,
    },
    /// Claims this percentage of what the donor has left to claim.
    RefundPartial {
        donor: usize,
        percent: u8,
    },
    /// Escrow can still be directed after the release window, until the sweep.
    Spend {
        applicant: usize,
        to: Payout,
        percent: u8,
    },
}

#[derive(Clone, Debug)]
struct Life {
    fee_bps: u32,
    tranches: u32,
    /// `(donor, amount)`. A donor may contribute more than once.
    contributions: StdVec<(usize, i128)>,
    applicants: StdVec<Applicant>,
    ending: Ending,
    fee_sweep: FeeSweep,
    releases: StdVec<ReleaseStep>,
    refunds: StdVec<RefundStep>,
}

fn mode() -> impl Strategy<Value = Mode> {
    prop_oneof![
        Just(Mode::Direct),
        Just(Mode::Allocated),
        Just(Mode::Restricted),
        Just(Mode::Open),
    ]
}

fn payout() -> impl Strategy<Value = Payout> {
    prop_oneof![Just(Payout::School), Just(Payout::Clinic)]
}

fn applicant() -> impl Strategy<Value = Applicant> {
    (
        1i128..=60_000,
        [1u8..=100, 1u8..=100],
        mode(),
        prop::bool::weighted(0.85),
        prop::bool::weighted(0.8),
    )
        .prop_map(
            |(requested, votes, mode, finalize, policy_installed)| Applicant {
                requested,
                votes,
                mode,
                finalize,
                policy_installed,
            },
        )
}

fn life() -> impl Strategy<Value = Life> {
    let release_step = prop_oneof![
        4 => (0..MAX_APPLICANTS).prop_map(|applicant| ReleaseStep::Release { applicant }),
        2 => (0..MAX_APPLICANTS, 1u8..=4)
            .prop_map(|(applicant, proofs)| ReleaseStep::ReleaseBatch { applicant, proofs }),
        3 => (0..MAX_APPLICANTS, payout(), 1u8..=100)
            .prop_map(|(applicant, to, percent)| ReleaseStep::Spend { applicant, to, percent }),
    ];
    let refund_step = prop_oneof![
        3 => (0..MAX_DONORS).prop_map(|donor| RefundStep::Refund { donor }),
        3 => (0..MAX_DONORS, 1u8..=100)
            .prop_map(|(donor, percent)| RefundStep::RefundPartial { donor, percent }),
        1 => (0..MAX_APPLICANTS, payout(), 1u8..=100)
            .prop_map(|(applicant, to, percent)| RefundStep::Spend { applicant, to, percent }),
    ];
    (
        0u32..=MAX_FEE_BPS,
        1u32..=4,
        prop::collection::vec((0..MAX_DONORS, 1i128..=50_000), 1..=8),
        prop::collection::vec(applicant(), 0..=MAX_APPLICANTS),
        prop_oneof![
            1 => Just(Ending::CancelledWhileOpen),
            1 => Just(Ending::CancelledAfterAwards),
            3 => Just(Ending::Natural),
        ],
        prop_oneof![
            Just(FeeSweep::DuringReview),
            Just(FeeSweep::AfterReleaseWindow),
            Just(FeeSweep::Never),
        ],
        prop::collection::vec(release_step, 0..=14),
        prop::collection::vec(refund_step, 0..=12),
    )
        .prop_map(
            |(
                fee_bps,
                tranches,
                contributions,
                applicants,
                ending,
                fee_sweep,
                releases,
                refunds,
            )| {
                Life {
                    fee_bps,
                    tranches,
                    contributions,
                    applicants,
                    ending,
                    fee_sweep,
                    releases,
                    refunds,
                }
            },
        )
}

struct World {
    f: Fixture,
    donors: StdVec<Address>,
    /// What each donor was minted and has not (successfully) contributed. A
    /// donor's balance above this is refund money.
    float: StdVec<i128>,
    recipients: StdVec<Address>,
    wallets: StdVec<Address>,
    school: Address,
    clinic: Address,
    next_proof: u8,
    /// What `sweep_fee` actually moved, if it ran.
    fee_swept: Option<i128>,
    unclaimed_swept: bool,
}

impl World {
    fn new(life: &Life) -> Self {
        let f = setup_full(2, 3, life.tranches, life.fee_bps);
        let mut donors = StdVec::new();
        let mut float = StdVec::new();
        for d in 0..MAX_DONORS {
            let minted: i128 = life
                .contributions
                .iter()
                .filter(|(i, _)| *i == d)
                .map(|(_, a)| a)
                .sum();
            let donor = Address::generate(&f.env);
            if minted > 0 {
                f.mint.mint(&donor, &minted);
            }
            donors.push(donor);
            float.push(minted);
        }
        let school = Address::generate(&f.env);
        let clinic = Address::generate(&f.env);
        f.client.allow_payee(&school);
        f.client.allow_payee(&clinic);

        let mut recipients = StdVec::new();
        let mut wallets = StdVec::new();
        for a in &life.applicants {
            let wallet = Address::generate(&f.env);
            if a.policy_installed {
                f.policy.install(&wallet);
            }
            recipients.push(Address::generate(&f.env));
            wallets.push(wallet);
        }

        World {
            f,
            donors,
            float,
            recipients,
            wallets,
            school,
            clinic,
            next_proof: 10,
            fee_swept: None,
            unclaimed_swept: false,
        }
    }

    fn payout(&self, to: Payout) -> &Address {
        match to {
            Payout::School => &self.school,
            Payout::Clinic => &self.clinic,
        }
    }

    fn fresh_proof(&mut self, recipient: &Address) -> BytesN<32> {
        let uid = proof(&self.f, recipient, self.next_proof);
        self.next_proof += 1;
        uid
    }

    /// Every address a tranche or a spend can reach.
    fn payout_addresses(&self) -> StdVec<&Address> {
        let mut all: StdVec<&Address> = self.recipients.iter().collect();
        all.extend(self.wallets.iter());
        all.push(&self.school);
        all.push(&self.clinic);
        all
    }

    fn escrow(&self) -> i128 {
        self.recipients
            .iter()
            .map(|r| self.f.client.allocation_of(r))
            .sum()
    }

    /// The money as the outside world sees it.
    fn ledger(&self) -> Ledger {
        let t = &self.f.token;
        let paid_out = self.payout_addresses().iter().map(|a| t.balance(a)).sum();
        let refunded = self
            .donors
            .iter()
            .zip(&self.float)
            .map(|(d, float)| t.balance(d) - float)
            .sum();
        Ledger {
            contract: t.balance(&self.f.client.address),
            paid_out,
            refunded,
            treasury: t.balance(&self.f.treasury),
        }
    }

    /// The invariants that must hold after every call, successful or not.
    fn check_books(&self, after: &dyn core::fmt::Debug) {
        let c = &self.f.client;
        let l = self.ledger();
        let contributed = c.total_contributed();
        let escrow = self.escrow();
        let ctx = format!("after {after:?}: {l:?}, contributed {contributed}, escrow {escrow}");

        // Nothing created, nothing lost: what came in is what is still held
        // plus what has gone out through each of the three exits.
        assert_eq!(
            contributed,
            l.contract + l.paid_out + l.refunded + l.treasury,
            "money created or lost. {ctx}"
        );

        // The contract's own totals describe the money that actually moved.
        let released = c.total_released();
        assert_eq!(
            released - escrow,
            l.paid_out,
            "total_released minus escrow is not what left for recipients and payees. {ctx}"
        );
        assert_eq!(c.total_refunded(), l.refunded, "total_refunded. {ctx}");
        assert_eq!(
            self.fee_swept.unwrap_or(0) + c.total_swept(),
            l.treasury,
            "treasury received something other than the fee and the sweep. {ctx}"
        );
        assert!(
            released <= c.total_granted(),
            "released more than was ever awarded. {ctx}"
        );
        assert!(
            c.total_granted() <= c.budget(),
            "awarded more than the budget. {ctx}"
        );

        // The balance is exactly what the contract still owes. Before the
        // final sweep that is three things: escrow its recipients may still
        // direct, the refundable pool (budget not yet released or refunded,
        // which includes awarded tranches still waiting on a proof), and the
        // fee if it has not been swept. After the sweep it owes nothing.
        if self.unclaimed_swept {
            assert_eq!(l.contract, 0, "money left behind after the sweep. {ctx}");
        } else {
            let pool = c.budget() - released - c.total_refunded();
            let fee_owed = if self.fee_swept.is_some() { 0 } else { c.fee() };
            assert!(pool >= 0, "refunded more than the pool. {ctx}");
            assert_eq!(
                l.contract,
                escrow + pool + fee_owed,
                "balance does not match what is owed (pool {pool}, fee {fee_owed}). {ctx}"
            );
        }
    }

    fn contribute(&mut self, donor: usize, amount: i128) {
        let d = &self.donors[donor];
        if let Ok(Ok(())) = self.f.client.try_contribute(d, &amount) {
            self.float[donor] -= amount;
        }
    }

    fn release(&mut self, applicant: usize) {
        let r = self.recipients[applicant].clone();
        let uid = self.fresh_proof(&r);
        let _ = self.f.client.try_release(&r, &uid, &self.f.verifier);
    }

    fn release_batch(&mut self, applicant: usize, proofs: u8) {
        let r = self.recipients[applicant].clone();
        // Batches are sized to the tranches that remain.
        let remaining = match self.f.client.try_get_award(&r) {
            Ok(Ok(a)) => a.tranches - a.tranches_released,
            _ => 0,
        };
        let n = (proofs as u32).min(remaining).max(1);
        let mut uids = Vec::new(&self.f.env);
        for _ in 0..n {
            uids.push_back(self.fresh_proof(&r));
        }
        let _ = self.f.client.try_release_batch(&r, &uids, &self.f.verifier);
    }

    fn spend(&mut self, applicant: usize, to: Payout, percent: u8) {
        let r = &self.recipients[applicant];
        let amount = (self.f.client.allocation_of(r) * percent as i128 / 100).max(1);
        let _ = self.f.client.try_spend(r, self.payout(to), &amount);
    }

    /// What `donor` could still claim, by the contract's proportional rule.
    fn claimable(&self, donor: usize) -> i128 {
        let c = &self.f.client;
        let d = &self.donors[donor];
        let total = c.total_contributed();
        if total == 0 {
            return 0;
        }
        let unpaid = c.budget() - c.total_released();
        c.contributed_by(d) * unpaid / total - c.refunded_to(d)
    }

    fn sweep_fee(&mut self) {
        if let Ok(Ok(fee)) = self.f.client.try_sweep_fee() {
            self.fee_swept = Some(fee);
        }
    }
}

#[derive(Debug)]
struct Ledger {
    contract: i128,
    paid_out: i128,
    refunded: i128,
    treasury: i128,
}

fn run(life: &Life) {
    let mut w = World::new(life);
    let n_apps = life.applicants.len();
    w.check_books(&"setup");

    // ---- Open: contributions and applications ----
    for &(donor, amount) in &life.contributions {
        w.contribute(donor, amount);
        w.check_books(&("contribute", donor, amount));
    }
    for (i, a) in life.applicants.iter().enumerate() {
        let _ =
            w.f.client
                .try_apply(&w.recipients[i], &a.requested, &hash(&w.f.env, 1));
        w.check_books(&("apply", i));
    }
    let cancelled = !matches!(life.ending, Ending::Natural);
    if let Ending::CancelledWhileOpen = life.ending {
        w.f.client.cancel();
        w.check_books(&"cancel while open");
    }

    // ---- Review: votes and finalisation ----
    to_review(&w.f);
    for (i, a) in life.applicants.iter().enumerate() {
        for (v, percent) in a.votes.iter().enumerate() {
            let approved = (a.requested * *percent as i128 / 100).max(1);
            let reviewer = w.f.reviewers.get(v as u32).unwrap();
            let _ =
                w.f.client
                    .try_review(&reviewer, &w.recipients[i], &approved);
        }
        if a.finalize {
            let payee = match a.mode {
                Mode::Direct => w.school.clone(),
                Mode::Restricted => w.wallets[i].clone(),
                Mode::Allocated | Mode::Open => w.recipients[i].clone(),
            };
            let _ = w.f.client.try_finalize(&w.recipients[i], &payee, &a.mode);
        }
        w.check_books(&("review and finalize", i, a));
    }
    if let FeeSweep::DuringReview = life.fee_sweep {
        w.sweep_fee();
        w.check_books(&"sweep_fee during review");
    }
    if let Ending::CancelledAfterAwards = life.ending {
        w.f.client.cancel();
        w.check_books(&"cancel after awards");
    }

    // ---- Release window: releases and spends. All refused once cancelled. ----
    for step in &life.releases {
        if n_apps == 0 {
            break;
        }
        match *step {
            ReleaseStep::Release { applicant } => w.release(applicant % n_apps),
            ReleaseStep::ReleaseBatch { applicant, proofs } => {
                w.release_batch(applicant % n_apps, proofs)
            }
            ReleaseStep::Spend {
                applicant,
                to,
                percent,
            } => w.spend(applicant % n_apps, to, percent),
        }
        w.check_books(step);
    }
    if cancelled {
        assert_eq!(
            w.f.client.total_released(),
            0,
            "a cancelled programme paid out"
        );
    }

    // ---- Refunds: open on cancellation, or at the release deadline ----
    if !cancelled {
        w.f.env.ledger().set_timestamp(RELEASE_DEADLINE);
    }
    if let FeeSweep::AfterReleaseWindow = life.fee_sweep {
        w.sweep_fee();
        w.check_books(&"sweep_fee after release window");
    }
    for step in &life.refunds {
        match *step {
            RefundStep::Refund { donor } => {
                let _ = w.f.client.try_refund(&w.donors[donor]);
            }
            RefundStep::RefundPartial { donor, percent } => {
                let amount = (w.claimable(donor) * percent as i128 / 100).max(1);
                let _ = w.f.client.try_refund_partial(&w.donors[donor], &amount);
            }
            RefundStep::Spend {
                applicant,
                to,
                percent,
            } => {
                if n_apps > 0 {
                    w.spend(applicant % n_apps, to, percent);
                }
            }
        }
        w.check_books(step);
    }

    // ---- Sweep: everything left goes to the treasury ----
    w.f.env.ledger().set_timestamp(SWEEP_DEADLINE);
    let c = &w.f.client;
    let fee = c.fee();
    let escrow_at_sweep = w.escrow();
    let unpaid = c.budget() - c.total_released();
    let total = c.total_contributed();
    let mut shares = 0i128;
    let mut unclaimed = 0i128;
    let mut contributors = 0i128;
    for d in &w.donors {
        let given = c.contributed_by(d);
        if given > 0 {
            let share = given * unpaid / total;
            shares += share;
            unclaimed += share - c.refunded_to(d);
            contributors += 1;
        }
    }
    let dust = unpaid - shares;
    let held = w.f.token.balance(&c.address);

    let swept = match c.try_sweep_unclaimed() {
        Ok(Ok(swept)) => swept,
        Err(Ok(Error::NothingToSweep)) => 0,
        other => panic!("sweep_unclaimed: {other:?}"),
    };
    w.unclaimed_swept = true;
    w.check_books(&"sweep_unclaimed");
    // Whether or not the fee was swept separately, a later attempt is refused.
    // The one exception: with nothing to sweep, `sweep_unclaimed` failed and
    // rolled back, so a zero fee that was never swept can still be "swept".
    match w.f.client.try_sweep_fee() {
        Err(Ok(Error::FeeAlreadySwept)) => {}
        Ok(Ok(0)) if held == 0 => w.fee_swept = Some(0),
        other => panic!("sweep_fee after sweep_unclaimed: {other:?}"),
    }
    w.check_books(&"sweep_fee after sweep_unclaimed");

    // ---- Every stroop accounted for ----
    let l = w.ledger();
    assert_eq!(swept, held, "the sweep did not take everything held");
    assert_eq!(
        total,
        l.paid_out + l.refunded + l.treasury,
        "contributed != paid out + refunded + swept: {l:?}"
    );
    assert_eq!(w.f.token.balance(&w.f.client.address), 0);

    // Where the swept money came from, to the stroop: the fee if it was not
    // swept on its own, escrow nobody directed in time, refunds nobody
    // claimed, and the rounding dust from flooring each donor's share.
    let fee_in_sweep = if w.fee_swept.is_some() { 0 } else { fee };
    assert!(
        (0..contributors.max(1)).contains(&dust),
        "dust {dust} is not explained by flooring {contributors} shares"
    );
    let mut explanation = StdString::new();
    for (name, v) in [
        ("fee", fee_in_sweep),
        ("escrow", escrow_at_sweep),
        ("unclaimed", unclaimed),
        ("dust", dust),
    ] {
        explanation.push_str(&format!("{name} {v}; "));
    }
    assert_eq!(
        swept,
        fee_in_sweep + escrow_at_sweep + unclaimed + dust,
        "sweep of {swept} is not {explanation}"
    );

    // A donor who never claimed cannot claim after the sweep: the money has
    // gone, and the attempt must change nothing.
    for d in w.donors.clone() {
        if w.f.client.contributed_by(&d) > 0 {
            let before = w.ledger();
            assert!(
                !matches!(w.f.client.try_refund(&d), Ok(Ok(_))),
                "a refund paid out after the sweep"
            );
            let after = w.ledger();
            assert_eq!(
                (before.contract, before.refunded),
                (after.contract, after.refunded)
            );
        }
    }
    w.check_books(&"late refund");
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(128))]

    #[test]
    fn money_is_conserved_over_a_random_programme_life(life in life()) {
        run(&life);
    }
}

/// Both endings pinned once, so neither depends on the generator's weights.
#[test]
fn money_is_conserved_when_cancelled_and_when_left_to_run() {
    for ending in [
        Ending::CancelledWhileOpen,
        Ending::CancelledAfterAwards,
        Ending::Natural,
    ] {
        run(&Life {
            fee_bps: 333,
            tranches: 3,
            contributions: std::vec![(0, 10_001), (1, 7), (2, 33_333), (0, 1)],
            applicants: std::vec![
                Applicant {
                    requested: 9_000,
                    votes: [100, 100],
                    mode: Mode::Allocated,
                    finalize: true,
                    policy_installed: false,
                },
                Applicant {
                    requested: 5_000,
                    votes: [50, 90],
                    mode: Mode::Restricted,
                    finalize: true,
                    policy_installed: true,
                },
                Applicant {
                    requested: 4_000,
                    votes: [100, 100],
                    mode: Mode::Direct,
                    finalize: true,
                    policy_installed: false,
                },
            ],
            ending,
            fee_sweep: FeeSweep::Never,
            releases: std::vec![
                ReleaseStep::Release { applicant: 0 },
                ReleaseStep::ReleaseBatch {
                    applicant: 1,
                    proofs: 2,
                },
                ReleaseStep::Spend {
                    applicant: 0,
                    to: Payout::School,
                    percent: 40,
                },
                ReleaseStep::ReleaseBatch {
                    applicant: 2,
                    proofs: 3,
                },
            ],
            refunds: std::vec![
                RefundStep::RefundPartial {
                    donor: 0,
                    percent: 30,
                },
                RefundStep::Refund { donor: 2 },
                RefundStep::Spend {
                    applicant: 0,
                    to: Payout::Clinic,
                    percent: 50,
                },
                // Donor 1 never claims.
            ],
        });
    }
}
