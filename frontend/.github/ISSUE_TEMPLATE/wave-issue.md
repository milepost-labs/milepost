---
name: Wave issue
about: Scoped work for a Drips Wave sprint
title: ''
labels: ''
assignees: ''
---

## What and why

<!-- The problem, not the solution. What is wrong or missing today, and what
     changes for a user or developer once this is done. A contributor should be
     able to judge whether the work matters from this paragraph alone. -->

## Context

<!-- Where in the codebase this lives, what it depends on, and anything that
     will surprise someone new. Link the files worth reading first. Call out
     constraints and edge cases rather than leaving them to be discovered. -->

## Suggested approach

<!-- Enough direction to prevent a dead end, not a line-by-line specification.
     A contributor should be free to disagree with this and do it better. -->

## Acceptance criteria

- [ ] <!-- Observable outcomes, not activities. "X returns Y when Z", not "look at X". -->
- [ ] Tests cover the behaviour, including the failure cases
- [ ] `npm run lint`, `npm run build` and `npm test` pass

## Definition of done

<!-- What must be in the PR: tests and updated docs. If the work needs a
     contract change, link the milepost issue: this repository only consumes
     published bindings. -->

## Out of scope

<!-- What this issue is deliberately NOT asking for. The most common way a Wave
     PR fails review is doing more than was asked, so name the adjacent work
     that belongs to a different issue. -->

## Branch and commits

```sh
git checkout -b feat/some-scoped-branch-name
```

```sh
git commit -m "feat(area): what changed"
git commit -m "test(area): cover the failure cases"
```

## Notes for contributors

- **Claim the issue before starting.** Comment here so it can be assigned and two
  people do not build the same thing.
- **Write a PR description that says what you did and why**, not one that restates
  the issue. If you made a judgement call, name it. If you disagreed with the
  suggested approach and did something better, say so — that is welcome, but
  explain the reasoning.
- **Link the issue** with `Closes #N`.
- **Show it working.** Screenshots or a short clip for UI, test output for
  logic, or the command you ran and what it printed.
- **Real implementations only.** No stubs, no `TODO` where the work should be, no
  code that compiles but does not do the thing. If you cannot finish in time, open
  a draft PR and say what is left — that is genuinely useful, and honest.
- **Ask here if anything is unclear.** An unclear issue is a defect in the issue,
  not in you.

## Guidelines

- Comment before starting so the issue can be assigned and work is not duplicated.
- Open a draft PR early if you want feedback part-way.
- Ask in the issue if anything here is unclear — that is a defect in the issue,
  not in you.
- If the work turns out to be materially harder than the complexity label
  suggests, say so and it will be re-labelled before the issue is closed.
