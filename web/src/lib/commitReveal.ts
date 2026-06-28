/**
 * commitReveal.ts
 *
 * Off-chain helper to compute the commitment hash that must match the on-chain formula:
 *
 *   bytes32 commitment = keccak256(
 *       abi.encodePacked(answer, salt, msg.sender, bountyId)
 *   );
 *
 * This is used in the SubmitCommitment component to hash locally before sending
 * only the commitment on-chain (the plaintext answer never leaves the browser).
 *
 * Also provides localStorage helpers to persist the (answer, salt) pair so the
 * user can reveal later without needing to remember them.
 */

import { keccak256, encodePacked, type Address } from "viem";

// ─── Commitment hashing ───────────────────────────────────────────────────────

/**
 * Compute the commitment hash matching Solidity's abi.encodePacked formula.
 * All parameters must be supplied exactly as they will be when revealAnswer() is called.
 */
export function computeCommitment(
  answer:   string,
  salt:     `0x${string}`,
  sender:   Address,
  bountyId: bigint,
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["string", "bytes32", "address", "uint256"],
      [answer, salt, sender, bountyId],
    ),
  );
}

/** Generate a cryptographically random 32-byte salt as a 0x hex string. */
export function generateSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

// ─── LocalStorage persistence ─────────────────────────────────────────────────

const STORAGE_KEY = "aiJudgeCR_savedAnswers";

interface SavedEntry {
  answer: string;
  salt:   `0x${string}`;
}

type StorageMap = Record<string, SavedEntry>;  // key: `${bountyId}:${address}`

function storageKey(bountyId: bigint, address: Address): string {
  return `${bountyId.toString()}:${address.toLowerCase()}`;
}

function readStorage(): StorageMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StorageMap) : {};
  } catch {
    return {};
  }
}

function writeStorage(map: StorageMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* private browsing / storage full — fail silently */
  }
}

/** Persist the plaintext answer and salt for later reveal. */
export function saveAnswerLocally(
  bountyId: bigint,
  address:  Address,
  answer:   string,
  salt:     `0x${string}`,
): void {
  const map = readStorage();
  map[storageKey(bountyId, address)] = { answer, salt };
  writeStorage(map);
}

/** Retrieve a previously saved (answer, salt) pair, or null if not found. */
export function loadSavedAnswer(
  bountyId: bigint,
  address:  Address,
): SavedEntry | null {
  const map = readStorage();
  return map[storageKey(bountyId, address)] ?? null;
}

/** Remove a saved entry after a successful reveal. */
export function clearSavedAnswer(bountyId: bigint, address: Address): void {
  const map = readStorage();
  delete map[storageKey(bountyId, address)];
  writeStorage(map);
}
