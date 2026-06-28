# Commit-Reveal AI Bounty Judge — Lifecycle & README

## Overview

`AIJudgeCommitReveal.sol` is a privacy-preserving extension of the workshop `AIJudge.sol`.
It prevents participants from reading each other's answers during the submission window by
using a **commit-reveal scheme**: only a cryptographic hash is stored on-chain during the
submission phase, and the plaintext answer is revealed later for AI judging.

---

## The Bounty Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. CREATE (owner)                                                      │
│     createBounty(title, rubric, submissionDeadline, revealDeadline)     │
│     → Reward locked in contract                                         │
│     → Two deadlines set: commit window + reveal window                  │
│                                                                         │
│  ──────────────  submissionDeadline  ──────────────                     │
│                                                                         │
│  2. COMMIT PHASE  (any participant, before submissionDeadline)          │
│     submitCommitment(bountyId, commitment)                              │
│     → commitment = keccak256(answer ++ salt ++ sender ++ bountyId)     │
│     → Only the hash is stored on-chain                                  │
│     → Answer is NOT visible to anyone                                   │
│     → One commitment per address per bounty                             │
│                                                                         │
│  ──────────────  submissionDeadline  ──────────────                     │
│                                                                         │
│  3. REVEAL PHASE  (committers, after sub-deadline, before rev-deadline) │
│     revealAnswer(bountyId, answer, salt)                                │
│     → Contract verifies hash matches stored commitment                  │
│     → Valid reveals: eligible = true                                    │
│     → Invalid hash (wrong answer or salt): eligible = false             │
│     → Answer text stored in contract but HIDDEN from getSubmission()    │
│       until judging is complete (privacy gate)                          │
│                                                                         │
│  ──────────────  revealDeadline  ──────────────                         │
│                                                                         │
│  4. JUDGE PHASE  (owner only, after revealDeadline)                     │
│     judgeAll(bountyId, llmInput)                                        │
│     → Off-chain: owner reads ONLY eligible answers from contract        │
│     → Builds one Ritual LLM batch judging request (NOT per answer)      │
│     → LLM call executed via Ritual TEE precompile (0x0802)              │
│     → AI scores all submissions together in one request                 │
│     → aiReview bytes stored on-chain                                    │
│     → After this call: getSubmission() reveals plaintext answers        │
│                                                                         │
│  5. FINALIZE  (owner only, after judging)                               │
│     finalizeWinner(bountyId, winnerIndex)                               │
│     → Owner reviews AI recommendation (advisory, not binding)          │
│     → Owner picks winner (must be an eligible submission)               │
│     → Reward transferred to winner's address                            │
│     → Bounty is sealed; no further state changes allowed                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Security Properties

### Commitment binding

The commitment formula ties the hash to three things:

```solidity
bytes32 commitment = keccak256(
    abi.encodePacked(answer, salt, msg.sender, bountyId)
);
```

| Included     | What it prevents                                               |
|-------------|----------------------------------------------------------------|
| `answer`    | Commitment can't be satisfied by a different answer            |
| `salt`      | Brute-force guessing of short answers is infeasible            |
| `msg.sender` | Participant B cannot reveal using Participant A's commitment   |
| `bountyId`  | The same commitment cannot be replayed on a different bounty   |

### Privacy gate in `getSubmission()`

```solidity
string memory visibleAnswer = bounty.judged ? sub.answer : "";
```

Even after `revealAnswer()` stores the plaintext on-chain, **`getSubmission()` returns an
empty string** until `judgeAll()` is called. This means no participant can gain an advantage
by reading others' revealed answers during the reveal window.

---

## Deployment

```bash
# Compile
cd hardhat && npx hardhat compile

# Deploy to Ritual devnet
npx hardhat ignition deploy ignition/modules/AIJudgeCommitReveal.ts --network ritual

# Copy the output address to web/.env.local
echo "NEXT_PUBLIC_CONTRACT_ADDRESS=<address>" >> ../web/.env.local

# Start the frontend
cd ../web && pnpm dev
```

---

## Running Tests

```bash
cd hardhat && npx hardhat test nodejs
```

The test suite covers:
- Setup validation (deadline ordering, non-zero reward)
- Commit phase enforcement (one per address, deadline gate)
- Reveal phase enforcement (hash verification, window gates, double-reveal prevention)
- Privacy gate verification (answer hidden before judging)
- Judge phase guards (only after reveal deadline, only with eligible submissions)
- Finalize guards (owner only, judged first, eligible winner required)

---

## Frontend UI

The web app shows a **phase banner** that changes color and description as the bounty moves
through its lifecycle:

| Phase          | Color  | What participants see                   |
|---------------|--------|------------------------------------------|
| Commit open   | 🟢 Green  | Submit Commitment form                 |
| Reveal open   | 🟣 Violet | Reveal Answer form (pre-filled)        |
| Judging ready | 🟡 Amber  | Owner sees "Judge" button              |
| Judged        | 🔵 Indigo | AI review + full answers visible       |
| Finalized     | ⚫ Zinc   | Winner highlighted, reward paid        |

The `SubmitCommitment` component generates a random salt in the browser, hashes the answer
client-side using `viem`'s `keccak256`, and saves `{ answer, salt }` to `localStorage`
keyed by `(bountyId, address)`. The `RevealAnswer` component pre-fills these fields
automatically when the reveal phase opens.

---

## Differences from Workshop Version

| Feature              | Workshop (`AIJudge`)       | Homework (`AIJudgeCommitReveal`) |
|---------------------|---------------------------|----------------------------------|
| Submission content  | Plaintext on-chain immediately | Hash only during commit phase |
| Deadlines           | 1 (submission)             | 2 (submission + reveal)         |
| Answer visibility   | Always public              | Hidden until judging complete   |
| Eligibility check   | All submissions            | Only valid reveals              |
| Commitment replay   | N/A                        | Blocked by sender+bountyId bind |
