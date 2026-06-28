// ABI for AIBountyJudgePro v2.0.0-commit-reveal
// Deployed on Ritual Chain (1979)
const abi = [
  // ── Events ──────────────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "uint256", name: "bountyId",           type: "uint256" },
      { indexed: true,  internalType: "address", name: "owner",              type: "address" },
      { indexed: false, internalType: "string",  name: "title",              type: "string"  },
      { indexed: false, internalType: "string",  name: "category",           type: "string"  },
      { indexed: false, internalType: "uint256", name: "reward",             type: "uint256" },
      { indexed: false, internalType: "uint256", name: "submissionDeadline", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "revealDeadline",     type: "uint256" },
    ],
    name: "BountyCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "uint256", name: "bountyId",        type: "uint256" },
      { indexed: true,  internalType: "uint256", name: "submissionIndex", type: "uint256" },
      { indexed: true,  internalType: "address", name: "submitter",       type: "address" },
      { indexed: false, internalType: "uint256", name: "timestamp",       type: "uint256" },
    ],
    name: "CommitmentSubmitted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "uint256", name: "bountyId",        type: "uint256" },
      { indexed: true,  internalType: "uint256", name: "submissionIndex", type: "uint256" },
      { indexed: true,  internalType: "address", name: "submitter",       type: "address" },
      { indexed: false, internalType: "bool",    name: "eligible",        type: "bool"    },
      { indexed: false, internalType: "uint256", name: "timestamp",       type: "uint256" },
    ],
    name: "AnswerRevealed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "uint256", name: "bountyId",     type: "uint256" },
      { indexed: false, internalType: "bytes",   name: "aiReview",     type: "bytes"   },
      { indexed: false, internalType: "uint256", name: "eligibleCount",type: "uint256" },
      { indexed: false, internalType: "uint256", name: "timestamp",    type: "uint256" },
    ],
    name: "AllAnswersJudged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "uint256", name: "bountyId",    type: "uint256" },
      { indexed: true,  internalType: "uint256", name: "winnerIndex", type: "uint256" },
      { indexed: true,  internalType: "address", name: "winner",      type: "address" },
      { indexed: false, internalType: "uint256", name: "reward",      type: "uint256" },
      { indexed: false, internalType: "uint256", name: "timestamp",   type: "uint256" },
    ],
    name: "WinnerFinalized",
    type: "event",
  },

  // ── Constants ────────────────────────────────────────────────────────────────
  {
    inputs: [],
    name: "MAX_SUBMISSIONS",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MAX_ANSWER_LENGTH",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "CONTRACT_VERSION",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },

  // ── State readers ────────────────────────────────────────────────────────────
  {
    inputs: [],
    name: "nextBountyId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "deployer",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },

  // ── createBounty ─────────────────────────────────────────────────────────────
  {
    inputs: [
      { internalType: "string",  name: "title",              type: "string"  },
      { internalType: "string",  name: "rubric",             type: "string"  },
      { internalType: "string",  name: "category",           type: "string"  },
      { internalType: "uint256", name: "submissionDeadline", type: "uint256" },
      { internalType: "uint256", name: "revealDeadline",     type: "uint256" },
    ],
    name: "createBounty",
    outputs: [{ internalType: "uint256", name: "bountyId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },

  // ── submitCommitment ─────────────────────────────────────────────────────────
  {
    inputs: [
      { internalType: "uint256", name: "bountyId",   type: "uint256" },
      { internalType: "bytes32", name: "commitment", type: "bytes32" },
    ],
    name: "submitCommitment",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ── revealAnswer ─────────────────────────────────────────────────────────────
  {
    inputs: [
      { internalType: "uint256", name: "bountyId", type: "uint256" },
      { internalType: "string",  name: "answer",   type: "string"  },
      { internalType: "bytes32", name: "salt",      type: "bytes32" },
    ],
    name: "revealAnswer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ── judgeAll ─────────────────────────────────────────────────────────────────
  {
    inputs: [
      { internalType: "uint256", name: "bountyId", type: "uint256" },
      { internalType: "bytes",   name: "llmInput", type: "bytes"   },
    ],
    name: "judgeAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ── finalizeWinner ───────────────────────────────────────────────────────────
  {
    inputs: [
      { internalType: "uint256", name: "bountyId",    type: "uint256" },
      { internalType: "uint256", name: "winnerIndex", type: "uint256" },
    ],
    name: "finalizeWinner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ── getBounty ────────────────────────────────────────────────────────────────
  {
    inputs: [{ internalType: "uint256", name: "bountyId", type: "uint256" }],
    name: "getBounty",
    outputs: [
      { internalType: "address", name: "owner",              type: "address" },
      { internalType: "string",  name: "title",              type: "string"  },
      { internalType: "string",  name: "rubric",             type: "string"  },
      { internalType: "string",  name: "category",           type: "string"  },
      { internalType: "uint256", name: "reward",             type: "uint256" },
      { internalType: "uint256", name: "submissionDeadline", type: "uint256" },
      { internalType: "uint256", name: "revealDeadline",     type: "uint256" },
      { internalType: "bool",    name: "judged",             type: "bool"    },
      { internalType: "bool",    name: "finalized",          type: "bool"    },
      { internalType: "uint256", name: "totalCommitted",     type: "uint256" },
      { internalType: "uint256", name: "totalRevealed",      type: "uint256" },
      { internalType: "uint256", name: "totalEligible",      type: "uint256" },
      { internalType: "uint256", name: "winnerIndex",        type: "uint256" },
      { internalType: "bytes",   name: "aiReview",           type: "bytes"   },
    ],
    stateMutability: "view",
    type: "function",
  },

  // ── getSubmission ────────────────────────────────────────────────────────────
  {
    inputs: [
      { internalType: "uint256", name: "bountyId", type: "uint256" },
      { internalType: "uint256", name: "index",    type: "uint256" },
    ],
    name: "getSubmission",
    outputs: [
      { internalType: "address", name: "submitter",   type: "address" },
      { internalType: "bytes32", name: "commitment",  type: "bytes32" },
      { internalType: "bool",    name: "revealed",    type: "bool"    },
      { internalType: "bool",    name: "eligible",    type: "bool"    },
      { internalType: "string",  name: "answer",      type: "string"  },
      { internalType: "uint256", name: "committedAt", type: "uint256" },
      { internalType: "uint256", name: "revealedAt",  type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },

  // ── hasCommitted ─────────────────────────────────────────────────────────────
  {
    inputs: [
      { internalType: "uint256", name: "bountyId",    type: "uint256" },
      { internalType: "address", name: "participant", type: "address" },
    ],
    name: "hasCommitted",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },

  // ── getContractInfo ──────────────────────────────────────────────────────────
  {
    inputs: [],
    name: "getContractInfo",
    outputs: [
      { internalType: "string",  name: "version",      type: "string"  },
      { internalType: "address", name: "deployerAddr",  type: "address" },
      { internalType: "uint256", name: "totalBounties", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },

  // ── getEligibleAnswers ──────────────────────────────────────────────────────
  // Owner-only, callable after revealDeadline. Returns all eligible submissions
  // with their plaintext answers so JudgeAll can build the LLM prompt correctly.
  {
    inputs: [{ internalType: "uint256", name: "bountyId", type: "uint256" }],
    name: "getEligibleAnswers",
    outputs: [
      { internalType: "address[]", name: "submitters", type: "address[]" },
      { internalType: "string[]",  name: "answers",    type: "string[]"  },
      { internalType: "uint256[]", name: "indices",    type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export default abi;
