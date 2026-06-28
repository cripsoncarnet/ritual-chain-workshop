import type { Address } from "viem";

// ─── Original (workshop) bounty ───────────────────────────────────────────────

/** Parsed shape of the `getBounty` tuple return value (original contract). */
export type Bounty = {
  owner: Address;
  title: string;
  rubric: string;
  reward: bigint;
  deadline: bigint;
  judged: boolean;
  finalized: boolean;
  submissionCount: bigint;
  winnerIndex: bigint;
  aiReview: `0x${string}`;
};

// ─── Commit-reveal bounty ─────────────────────────────────────────────────────

/**
 * Parsed shape of the `getBounty` tuple from AIJudgeCommitReveal.
 * Two deadlines replace the single deadline. Counts distinguish committed,
 * revealed, and eligible submissions.
 */
export type CommitRevealBounty = {
  owner:              Address;
  title:              string;
  rubric:             string;
  reward:             bigint;
  submissionDeadline: bigint;   // commit phase closes
  revealDeadline:     bigint;   // reveal phase closes, judging may begin
  judged:             boolean;
  finalized:          boolean;
  totalCommitted:     bigint;   // number of commitments submitted
  totalRevealed:      bigint;   // number of reveals attempted
  totalEligible:      bigint;   // reveals where hash matched
  winnerIndex:        bigint;
  aiReview:           `0x${string}`;
};

/** Map the positional tuple returned by getBounty() to a named object. */
export function parseCRBounty(
  raw: readonly [
    Address,  // owner
    string,   // title
    string,   // rubric
    bigint,   // reward
    bigint,   // submissionDeadline
    bigint,   // revealDeadline
    boolean,  // judged
    boolean,  // finalized
    bigint,   // totalCommitted
    bigint,   // totalRevealed
    bigint,   // totalEligible
    bigint,   // winnerIndex
    `0x${string}`, // aiReview
  ],
): CommitRevealBounty {
  const [
    owner, title, rubric, reward,
    submissionDeadline, revealDeadline,
    judged, finalized,
    totalCommitted, totalRevealed, totalEligible,
    winnerIndex, aiReview,
  ] = raw;
  return {
    owner, title, rubric, reward,
    submissionDeadline, revealDeadline,
    judged, finalized,
    totalCommitted, totalRevealed, totalEligible,
    winnerIndex, aiReview,
  };
}

/**
 * Lifecycle phase for a commit-reveal bounty.
 *
 *   commit-open   → before submissionDeadline
 *   reveal-open   → after submissionDeadline, before revealDeadline
 *   judging-ready → after revealDeadline, not yet judged
 *   judged        → judging complete, owner can finalize
 *   finalized     → winner paid, done
 */
export type CommitRevealStatus =
  | "commit-open"
  | "reveal-open"
  | "judging-ready"
  | "judged"
  | "finalized";

function normalizeTs(ts: bigint | number): number {
  const val = Number(ts);
  return val > 1e11 ? Math.floor(val / 1000) : val;
}

export function getCRBountyStatus(
  b: CommitRevealBounty,
  nowSeconds = Date.now() / 1000,
): CommitRevealStatus {
  if (b.finalized) return "finalized";
  if (b.judged)    return "judged";
  const now = nowSeconds;
  if (now >= normalizeTs(b.revealDeadline))     return "judging-ready";
  if (now >= normalizeTs(b.submissionDeadline)) return "reveal-open";
  return "commit-open";
}

export const CR_STATUS_META: Record<
  CommitRevealStatus,
  { label: string; tone: "green" | "amber" | "indigo" | "zinc" | "violet" }
> = {
  "commit-open":    { label: "Commit open",     tone: "green"  },
  "reveal-open":    { label: "Reveal open",     tone: "violet" },
  "judging-ready":  { label: "Ready to judge",  tone: "amber"  },
  judged:           { label: "Judged",           tone: "indigo" },
  finalized:        { label: "Finalized",        tone: "zinc"   },
};

/** Can a participant still commit? */
export function canCommit(b: CommitRevealBounty, nowSeconds = Date.now() / 1000): boolean {
  return !b.judged && !b.finalized && normalizeTs(b.submissionDeadline) > nowSeconds;
}

/** Can a participant reveal their answer? */
export function canReveal(b: CommitRevealBounty, nowSeconds = Date.now() / 1000): boolean {
  const now = nowSeconds;
  return (
    !b.judged &&
    !b.finalized &&
    normalizeTs(b.submissionDeadline) <= now &&
    normalizeTs(b.revealDeadline) > now
  );
}

/** Can the owner trigger judging? */
export function canJudge(b: CommitRevealBounty, nowSeconds = Date.now() / 1000): boolean {
  return (
    !b.judged &&
    !b.finalized &&
    normalizeTs(b.revealDeadline) <= nowSeconds &&
    b.totalEligible > 0n
  );
}

/** getBounty returns a positional tuple — map it to a named object. */
export function parseBounty(
  raw: readonly [
    Address,
    string,
    string,
    bigint,
    bigint,
    boolean,
    boolean,
    bigint,
    bigint,
    `0x${string}`,
  ],
): Bounty {
  const [
    owner,
    title,
    rubric,
    reward,
    deadline,
    judged,
    finalized,
    submissionCount,
    winnerIndex,
    aiReview,
  ] = raw;
  return {
    owner,
    title,
    rubric,
    reward,
    deadline,
    judged,
    finalized,
    submissionCount,
    winnerIndex,
    aiReview,
  };
}

export type BountyStatus = "open" | "ready" | "judged" | "finalized";

export function getBountyStatus(b: Bounty, nowSeconds = Date.now() / 1000): BountyStatus {
  if (b.finalized) return "finalized";
  if (b.judged) return "judged";
  const deadlinePassed = Number(b.deadline) <= nowSeconds;
  return deadlinePassed ? "ready" : "open";
}

export const STATUS_META: Record<
  BountyStatus,
  { label: string; tone: "green" | "amber" | "indigo" | "zinc" }
> = {
  open: { label: "Open", tone: "green" },
  ready: { label: "Ready for judging", tone: "amber" },
  judged: { label: "Judged", tone: "indigo" },
  finalized: { label: "Finalized", tone: "zinc" },
};

/** Can a participant still submit an answer? */
export function canSubmit(b: Bounty, nowSeconds = Date.now() / 1000): boolean {
  return !b.judged && !b.finalized && Number(b.deadline) > nowSeconds;
}

// ─── AIBountyJudgePro bounty ──────────────────────────────────────────────────

/** Parsed shape of `getBounty` from AIBountyJudgePro. */
export type ProBounty = {
  owner:           Address;
  title:           string;
  rubric:          string;
  category:        string;
  reward:          bigint;
  deadline:        bigint;
  judged:          boolean;
  finalized:       boolean;
  submissionCount: bigint;
  winnerIndex:     bigint;
  aiReview:        `0x${string}`;
};

/** Map the positional tuple returned by AIBountyJudgePro.getBounty() to a named object. */
export function parseProBounty(
  raw: readonly [
    Address,        // owner
    string,         // title
    string,         // rubric
    string,         // category
    bigint,         // reward
    bigint,         // deadline
    boolean,        // judged
    boolean,        // finalized
    bigint,         // submissionCount
    bigint,         // winnerIndex
    `0x${string}`,  // aiReview
  ],
): ProBounty {
  const [owner, title, rubric, category, reward, deadline, judged, finalized, submissionCount, winnerIndex, aiReview] = raw;
  return { owner, title, rubric, category, reward, deadline, judged, finalized, submissionCount, winnerIndex, aiReview };
}

export type ProBountyStatus = "open" | "ready" | "judged" | "finalized";

function normalizeProTs(ts: bigint | number): number {
  const val = Number(ts);
  return val > 1e11 ? Math.floor(val / 1000) : val;
}

export function getProBountyStatus(b: ProBounty, nowSeconds = Date.now() / 1000): ProBountyStatus {
  if (b.finalized) return "finalized";
  if (b.judged)    return "judged";
  return normalizeProTs(b.deadline) > nowSeconds ? "open" : "ready";
}

export const PRO_STATUS_META: Record<
  ProBountyStatus,
  { label: string; tone: "green" | "amber" | "indigo" | "zinc" }
> = {
  open:      { label: "Open — accepting answers", tone: "green"  },
  ready:     { label: "Ready for AI judging",     tone: "amber"  },
  judged:    { label: "Judged",                   tone: "indigo" },
  finalized: { label: "Finalized",                tone: "zinc"   },
};

/** Can a participant still submit an answer to a Pro bounty? */
export function canSubmitPro(b: ProBounty, nowSeconds = Date.now() / 1000): boolean {
  return !b.judged && !b.finalized && normalizeProTs(b.deadline) > nowSeconds;
}

/** Can the owner judge a Pro bounty? */
export function canJudgePro(b: ProBounty, nowSeconds = Date.now() / 1000): boolean {
  return !b.judged && !b.finalized && normalizeProTs(b.deadline) <= nowSeconds && b.submissionCount > 0n;
}

