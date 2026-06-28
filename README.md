# AIBountyJudgePro — Privacy-Preserving AI Bounty Judge

> **Contract:** `AIBountyJudgePro.sol` — v2.0.0-commit-reveal  
> **Deployed on:** Ritual Chain (Chain ID: 1979)  
> **Contract Address:** `0xbd9F76048B49EFcD455a31405dd46A196CAaDeb1`  
> **Executor Wallet:** `0xB42e435c4252A5a2E7440e37B609F00c61a0c91B`

---

## Overview

This contract extends the base `AIJudge` workshop contract with:

1. **Commit-Reveal Privacy** — answers are hidden until the reveal phase closes, preventing frontrunning
2. **Category Tags** — bounties can be tagged with topics like "DeFi", "Security", "AI/ML"
3. **Increased Capacity** — `MAX_SUBMISSIONS = 15` (up from 10)
4. **Timestamps on Events** — every event now emits `block.timestamp` for auditability
5. **Deployer Tracking** — `deployer` address and `getContractInfo()` for UI display
6. **Ritual AI Batch Judging** — a single LLM precompile call scores all eligible answers

---

## Lifecycle

```
Owner                  Participants           Contract              Ritual AI
─────                  ────────────           ────────              ─────────
createBounty()
  title, rubric,
  category,
  submissionDeadline,
  revealDeadline,
  msg.value (reward)
                           │
                           ▼ COMMIT PHASE (now → submissionDeadline)
                       submitCommitment()
                         commitment =
                         keccak256(answer +
                           salt + sender +
                           bountyId)
                           │
                           ▼ REVEAL PHASE (submissionDeadline → revealDeadline)
                       revealAnswer()
                         contract verifies
                         hash matches →
                         eligible = true
                           │
                           ▼ JUDGE PHASE (after revealDeadline)
judgeAll()  ───────────────────────────────────────────────────▶ LLM call
  all eligible answers                                           (batch scoring)
  encoded in llmInput                                            returns JSON
                                               aiReview stored ◀─────────────
                           │
                           ▼ FINALIZE
finalizeWinner()
  picks winner index
  (AI advised, owner
  decides)
  → transfers reward
    to winner wallet
```

---

## Key Functions

### `createBounty(title, rubric, category, submissionDeadline, revealDeadline)`
Creates a new bounty. The `msg.value` sent is locked as the reward.

### `submitCommitment(bountyId, commitment)`
Phase 1 — participants submit only a hash:
```solidity
bytes32 commitment = keccak256(
    abi.encodePacked(answer, salt, msg.sender, bountyId)
);
```
Including `msg.sender` and `bountyId` prevents:
- Copying another participant's commitment
- Cross-bounty replay attacks

### `revealAnswer(bountyId, answer, salt)`
Phase 2 — participants reveal their plaintext answer. The contract re-derives the hash and marks the submission `eligible = true` if it matches.

### `judgeAll(bountyId, llmInput)`
Phase 3 — owner triggers a **single** Ritual AI call encoding all eligible answers. The LLM returns a ranked JSON response with scores.

### `finalizeWinner(bountyId, winnerIndex)`
Phase 4 — owner picks the winner (the AI's recommendation is advisory). The reward is transferred to the winner's address.

---

## Privacy Properties

| What is stored on-chain | When it becomes visible |
|---|---|
| Commitment hash | Always public |
| Plaintext answer | Only after `judged == true` (privacy gate in `getSubmission`) |
| AI scores | After `judgeAll` completes |
| Winner address | After `finalizeWinner` |

The `getSubmission()` function enforces the privacy gate:
```solidity
// ── Privacy gate ──────────────────────────────────────────
// Reveal plaintext only after judging is complete so that no
// participant can read rival answers before the judging phase.
string memory visibleAnswer = bounty.judged ? sub.answer : "";
```

---

## Differences from `AIJudge.sol` (base workshop contract)

| Feature | AIJudge (base) | AIBountyJudgePro (this) |
|---|---|---|
| Privacy | ❌ Answers public immediately | ✅ Commit-reveal scheme |
| Frontrunning | ❌ Vulnerable | ✅ Protected |
| Max submissions | 10 | **15** |
| Category field | ❌ | ✅ `"DeFi"`, `"Security"`, etc. |
| Event timestamps | ❌ | ✅ All events include `block.timestamp` |
| Deployer tracking | ❌ | ✅ `deployer` state var |
| `getContractInfo()` | ❌ | ✅ Version, deployer, total bounties |
| Executor wallet | `0x532F0dF...` | `0xB42e435c4252A5a2E7440e37B609F00c61a0c91B` |
| Solidity version | 0.8.24 | 0.8.24 |

---

## Reflection Question

> *"What should be public, what should stay hidden, and what should be decided by AI versus by a human in a bounty system?"*

In a fair bounty system, the commitment hash and the deadline structure should be fully public so that participants can verify the rules are being enforced honestly. The plaintext answers, however, must remain hidden until after the submission deadline to prevent participants from reading rivals' work and submitting improved copies — this is the core problem the commit-reveal scheme solves. After the reveal deadline, the answers become visible only to the judging system (the Ritual AI), but not to other participants until scoring is complete, which eliminates a second window of copying. The AI should handle objective, comparative scoring of all answers against the rubric at once, since batch judging with a single LLM call ensures consistent scoring criteria across all submissions and prevents favoritism. However, the final winner selection should remain a human decision: the bounty owner reviews the AI's ranked recommendations and makes the final call, because context, edge cases, and domain-specific judgment are still beyond what an LLM can fully evaluate. Reward payment should be automatic and trustless once a winner is confirmed — removing any possibility of the bounty creator withholding funds. Ultimately, AI provides consistent, unbiased preliminary scoring; humans provide accountable final judgment; and the blockchain provides immutable, transparent enforcement of the rules.
