# Architecture Note: Commit-Reveal vs. Ritual-Native Encrypted Submissions

## 1. The Problem: Why Public Submissions Are Unfair

In the original workshop `AIJudge.sol`, calling `submitAnswer()` stores the plaintext answer
directly in contract storage. Because all Ethereum state is public, any participant (or bot)
can read every submission immediately after it lands on-chain and submit a better version
before the deadline. This breaks the fundamental fairness assumption of a competitive bounty.

---

## 2. Required Track: Commit-Reveal

### How It Works

```
Participant                On-chain (public)           Off-chain
──────────                 ─────────────────           ─────────
                           
answer + salt ─keccak256─▶ commitment hash             (answer hidden)
                           stored in contract
                           
                  ← submission deadline passes →
                  
answer + salt ──────────▶  reveal verified               answer stored in
                           eligible = true              contract (but hidden
                                                        by privacy gate)
                  ← reveal deadline passes →

                           judgeAll() called
                           eligible answers ──────────▶ LLM batch judging
                           now visible in              via Ritual precompile
                           getSubmission()
```

### What Stays Hidden

| Data            | Before reveal deadline | After reveal deadline | After judgeAll() |
|----------------|----------------------|----------------------|-----------------|
| Plaintext answer | ✅ Hidden             | ✅ Hidden (privacy gate) | 🔓 Public     |
| Commitment hash  | 🔓 Public             | 🔓 Public            | 🔓 Public      |
| AI scores        | ✅ Hidden             | ✅ Hidden            | 🔓 Public      |

### Trade-off: The Reveal Window

The commit-reveal scheme has **one remaining weakness**: after participants reveal their
answers and before the owner triggers `judgeAll()`, the revealed answers are stored in the
contract. `getSubmission()` hides them (privacy gate), but the data is technically in
contract storage. A chain-level storage read (e.g., `eth_getStorageAt`) could bypass
`getSubmission()` and expose the data. For most practical purposes this window is short,
but it is not cryptographically private.

---

## 3. Advanced Track: Ritual-Native TEE Encrypted Submissions

### Design Goal

Answers stay **encrypted** until the AI judging step, and the plaintext never appears in
public on-chain storage at any point — not even briefly.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  SUBMIT PHASE                                                                   │
│                                                                                 │
│  Participant                                                                    │
│  ──────────                                                                     │
│  1. Fetch TEE executor's public key (from Ritual DKMS precompile / docs)        │
│  2. Encrypt answer with TEE pubkey:  ciphertext = Encrypt(answer, tee_pubkey)  │
│  3. Store ciphertext on IPFS / Arweave → get CID                               │
│  4. Call submitEncrypted(bountyId, cid, hash(ciphertext))                      │
│     → Only CID + hash stored on-chain; plaintext never touches chain            │
│                                                                                 │
│  ─────────────────────  deadline passes  ─────────────────────                  │
│                                                                                 │
│  JUDGE PHASE                                                                    │
│                                                                                 │
│  Owner calls judgeAll(bountyId, llmInput)                                       │
│     ↓                                                                           │
│  Ritual TEE executor (inside hardware enclave)                                  │
│  ──────────────────────────────────────────────                                 │
│  5. Fetches each CID from IPFS                                                  │
│  6. Decrypts each ciphertext using TEE private key (never leaves enclave)       │
│  7. Verifies hash(ciphertext) matches on-chain commitment                       │
│  8. Sends ALL plaintext answers to LLM in one batch request                     │
│  9. Receives scores + winner recommendation from LLM                           │
│  10. Publishes { winnerIndex, ranking, revealedAnswersRef, revealedAnswersHash }│
│      back to the contract                                                       │
│                                                                                 │
│  POST-JUDGE                                                                     │
│                                                                                 │
│  11. TEE optionally publishes the plaintext bundle to IPFS                     │
│  12. Contract stores revealedAnswersHash for anyone to verify                  │
│  13. Owner calls finalizeWinner(bountyId, winnerIndex)                          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Where Does Plaintext Live?

| Location            | Has Plaintext? | When?                                | Who can see it?               |
|--------------------|---------------|---------------------------------------|-------------------------------|
| Participant's browser | ✅ Yes      | Always                                | Participant only              |
| IPFS / Arweave     | Encrypted only | Until TEE reveals bundle             | Nobody (encrypted)            |
| On-chain storage   | ❌ Never       | N/A                                   | N/A                           |
| TEE enclave        | ✅ Briefly     | During judgeAll() execution only     | TEE hardware attestation only |
| IPFS (post-judge)  | ✅ Revealed    | After TEE publishes the bundle       | Everyone (public)             |

### On-chain vs. Off-chain Data

| Data                  | Where stored     | Notes                                     |
|----------------------|-----------------|-------------------------------------------|
| CID of ciphertext    | On-chain        | Tiny, cheap to store                      |
| Hash of ciphertext   | On-chain        | Integrity check; TEE verifies before decrypt |
| Ciphertext blob      | IPFS / Arweave  | Large; gas cost avoided                   |
| Plaintext answers    | Off-chain (TEE) | Decrypted only inside enclave             |
| AI ranking + winner  | On-chain        | Posted by TEE after judging               |
| Revealed answer bundle | IPFS (post-judge) | CID + hash stored on-chain; contents public after judging |

### Example Final On-chain Output Shape

```json
{
  "winnerIndex": 2,
  "ranking": [
    { "index": 2, "score": 94, "reason": "Best satisfies all rubric criteria." },
    { "index": 0, "score": 71, "reason": "Good but lacks novelty." },
    { "index": 1, "score": 58, "reason": "Incomplete answer." }
  ],
  "revealedAnswersRef":  "ipfs://Qm...",
  "revealedAnswersHash": "0xabc123...",
  "summary": "Submission 2 is the strongest answer overall."
}
```

### Why This Is More Private Than Commit-Reveal

| Property                  | Commit-Reveal           | Ritual TEE              |
|--------------------------|------------------------|-------------------------|
| Answer in chain storage  | Yes (after reveal)     | No (never)              |
| Answer visible pre-judge | Technically (storage)  | No (encrypted)          |
| Trust assumption         | Smart contract logic   | TEE hardware + Ritual   |
| Complexity               | Low                    | High                    |
| Works on any EVM chain   | Yes                    | Ritual Chain only       |

---

## 4. Batch Judging Requirement

Both tracks use **one LLM call** for all submissions — not one per answer:

- **Why**: Multiple LLM calls per answer would be expensive (each is an on-chain tx), and
  the AI would judge each submission in isolation rather than comparatively.
- **How**: The owner (or TEE) assembles all eligible answers into a single JSON array and
  sends them in one Ritual LLM precompile request. The system prompt instructs the model to
  rank and select exactly one winner.
- **Human finalization**: The AI result is advisory. The bounty owner calls
  `finalizeWinner()` with their chosen winner index. This protects against prompt injection
  in submissions, LLM hallucinations, or malformed AI output triggering automatic payouts.

---

## 5. Reflection Question

> *What should be public, what should stay hidden, and what should be decided by AI versus
> by a human in a bounty system?*

In a fair bounty system, the **terms of the contest** should always be public: the bounty
title, rubric, reward amount, and both deadlines must be visible so all participants can
compete on equal footing. Equally, the **final outcome** — who won and what they were paid —
must be public and verifiable on-chain, so losers can confirm the result was legitimate.
What should stay hidden until judging is complete is the **content of each submission**,
because exposing answers early gives later entrants an unfair informational advantage, which
is precisely what the commit-reveal and TEE tracks solve in different ways.

The **AI's role** is best limited to comparative ranking: it can evaluate many answers
simultaneously against the rubric without the risk of cherry-picking or playing favorites,
making it well-suited for the aggregation step. However, **humans should retain the final
decision** for two reasons: first, AI outputs can be corrupted by prompt injection embedded
in untrusted submissions; second, automatically paying out based on raw AI text bypasses
on-chain safety checks and could be exploited with malformed LLM responses. The bounty
owner acting as a human-in-the-loop finalizer is a small but critical safety gate that
keeps the system trustworthy even when the AI makes mistakes.
