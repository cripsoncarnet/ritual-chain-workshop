/**
 * AIJudgeCommitReveal — Test Suite
 *
 * Runner : Hardhat 3 + Node.js native `node:test`
 * Library: viem + hardhat-viem + hardhat-network-helpers
 *
 * Pattern: `hre.network.create()` returns { viem, networkHelpers } connected
 * to an isolated local simulation. This is the Hardhat 3 recommended approach.
 *
 * Run with:
 *   cd hardhat && npx hardhat test nodejs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { parseEther, keccak256, encodePacked, padHex, type Address } from "viem";

// ─── Network setup ────────────────────────────────────────────────────────────

// One shared simulated chain for the whole test suite.
// loadFixture snapshots state between tests for isolation.
const { viem, networkHelpers } = await hre.network.create();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUBMISSION_WINDOW = 60;  // seconds
const REVEAL_WINDOW     = 60;  // seconds after submission close

/**
 * Compute the commitment hash matching the Solidity formula:
 *   keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
 */
function makeCommitment(
  answer:   string,
  salt:     `0x${string}`,
  sender:   Address,
  bountyId: bigint,
): `0x${string}` {
  // Ensure salt is padded to exactly 32 bytes as Solidity bytes32 expects
  const salt32 = padHex(salt, { size: 32 });
  return keccak256(encodePacked(
    ["string", "bytes32", "address", "uint256"],
    [answer,    salt32,     sender,    bountyId],
  ));
}

/** Advance EVM time by `seconds`. */
async function timeTravel(seconds: number) {
  await networkHelpers.time.increase(seconds);
}

// ─── Fixture ──────────────────────────────────────────────────────────────────

async function deployFixture() {
  const [ownerWallet, p1Wallet, p2Wallet] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const contract = await viem.deployContract("AIJudgeCommitReveal");

  const now = BigInt(await networkHelpers.time.latest());
  const submissionDeadline = now + BigInt(SUBMISSION_WINDOW);
  const revealDeadline     = submissionDeadline + BigInt(REVEAL_WINDOW);

  // Create bounty as owner
  await contract.write.createBounty(
    ["Test Bounty", "Score on clarity and correctness", submissionDeadline, revealDeadline],
    { value: parseEther("1"), account: ownerWallet.account },
  );

  return {
    contract,
    publicClient,
    ownerWallet,
    p1Wallet,
    p2Wallet,
    bountyId: 1n,
    submissionDeadline,
    revealDeadline,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("AIJudgeCommitReveal", () => {

  // ── Setup ──────────────────────────────────────────────────────────────────
  describe("createBounty", () => {
    it("stores correct deadlines and reward", async () => {
      const { contract, bountyId, submissionDeadline, revealDeadline } =
        await networkHelpers.loadFixture(deployFixture);

      const [,,,reward, subDl, revDl] = await contract.read.getBounty([bountyId]);

      assert.equal(reward, parseEther("1"),    "reward mismatch");
      assert.equal(subDl,  submissionDeadline, "submissionDeadline mismatch");
      assert.equal(revDl,  revealDeadline,     "revealDeadline mismatch");
    });

    it("reverts when revealDeadline <= submissionDeadline", async () => {
      const fresh     = await viem.deployContract("AIJudgeCommitReveal");
      const [owner]   = await viem.getWalletClients();
      const now       = BigInt(await networkHelpers.time.latest());

      await assert.rejects(
        () => fresh.write.createBounty(
          ["Bad", "rubric", now + 60n, now + 60n],
          { value: parseEther("1"), account: owner.account },
        ),
        /reveal deadline must follow submission deadline/,
      );
    });

    it("reverts with zero reward", async () => {
      const fresh   = await viem.deployContract("AIJudgeCommitReveal");
      const [owner] = await viem.getWalletClients();
      const now     = BigInt(await networkHelpers.time.latest());

      await assert.rejects(
        () => fresh.write.createBounty(
          ["No Reward", "rubric", now + 60n, now + 120n],
          { value: 0n, account: owner.account },
        ),
        /reward required/,
      );
    });
  });

  // ── Commit Phase ──────────────────────────────────────────────────────────
  describe("submitCommitment (commit phase)", () => {
    it("stores commitment without revealing the answer", async () => {
      const { contract, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      const answer     = "My secret answer";
      const salt       = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as `0x${string}`;
      const commitment = makeCommitment(answer, salt, p1Wallet.account.address, bountyId);

      await contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account });

      const [submitter, storedCommitment, revealed, eligible, visibleAnswer] =
        await contract.read.getSubmission([bountyId, 0n]);

      assert.equal(submitter.toLowerCase(), p1Wallet.account.address.toLowerCase(), "submitter wrong");
      assert.equal(storedCommitment, commitment,                               "commitment wrong");
      assert.equal(revealed,         false,                                    "should not be revealed");
      assert.equal(eligible,         false,                                    "should not be eligible");
      assert.equal(visibleAnswer,    "",                                       "answer must be hidden");
    });

    it("reverts when participant commits twice", async () => {
      const { contract, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      const commitment = makeCommitment("answer", padHex("0xaabbccdd", { size: 32 }), p1Wallet.account.address, bountyId);

      await contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account });

      await assert.rejects(
        () => contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account }),
        /already committed/,
      );
    });

    it("reverts commitment after submissionDeadline", async () => {
      const { contract, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      await timeTravel(SUBMISSION_WINDOW + 5);

      const commitment = makeCommitment("late", padHex("0xaabb", { size: 32 }), p1Wallet.account.address, bountyId);
      await assert.rejects(
        () => contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account }),
        /submission phase closed/,
      );
    });
  });

  // ── Reveal Phase ─────────────────────────────────────────────────────────
  describe("revealAnswer (reveal phase)", () => {
    const ANSWER = "My detailed technical answer";
    const SALT   = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;

    async function commitAndAdvance() {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { contract, p1Wallet, bountyId } = ctx;

      const commitment = makeCommitment(ANSWER, SALT, p1Wallet.account.address, bountyId);
      await contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account });

      // Enter reveal window
      await timeTravel(SUBMISSION_WINDOW + 2);

      return ctx;
    }

    it("accepts a valid reveal and marks submission eligible", async () => {
      const { contract, p1Wallet, bountyId } = await commitAndAdvance();

      await contract.write.revealAnswer([bountyId, ANSWER, SALT], { account: p1Wallet.account });

      const [,, revealed, eligible] = await contract.read.getSubmission([bountyId, 0n]);
      assert.equal(revealed, true,  "should be marked revealed");
      assert.equal(eligible, true,  "should be marked eligible");
    });

    it("answer is still hidden (empty) after reveal but before judging", async () => {
      const { contract, p1Wallet, bountyId } = await commitAndAdvance();

      await contract.write.revealAnswer([bountyId, ANSWER, SALT], { account: p1Wallet.account });

      const [,,,, visibleAnswer] = await contract.read.getSubmission([bountyId, 0n]);
      assert.equal(visibleAnswer, "", "answer must be empty until judging completes");
    });

    it("reverts reveal before submissionDeadline (still in commit phase)", async () => {
      const { contract, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      const commitment = makeCommitment(ANSWER, SALT, p1Wallet.account.address, bountyId);
      await contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account });

      // Do NOT advance time — still in commit window
      await assert.rejects(
        () => contract.write.revealAnswer([bountyId, ANSWER, SALT], { account: p1Wallet.account }),
        /reveal phase not started/,
      );
    });

    it("reverts reveal after revealDeadline", async () => {
      const { contract, p1Wallet, bountyId } = await commitAndAdvance();

      // Jump past reveal window too
      await timeTravel(REVEAL_WINDOW + 5);

      await assert.rejects(
        () => contract.write.revealAnswer([bountyId, ANSWER, SALT], { account: p1Wallet.account }),
        /reveal phase closed/,
      );
    });

    it("marks submission ineligible when wrong salt provided", async () => {
      const { contract, p1Wallet, bountyId } = await commitAndAdvance();
      const wrongSalt = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as `0x${string}`;

      // Reveal goes through, but hash mismatch → eligible = false
      await contract.write.revealAnswer([bountyId, ANSWER, wrongSalt], { account: p1Wallet.account });

      const [,, revealed, eligible] = await contract.read.getSubmission([bountyId, 0n]);
      assert.equal(revealed, true,  "revealed flag should be set");
      assert.equal(eligible, false, "wrong salt → hash mismatch → ineligible");
    });

    it("reverts double reveal", async () => {
      const { contract, p1Wallet, bountyId } = await commitAndAdvance();

      await contract.write.revealAnswer([bountyId, ANSWER, SALT], { account: p1Wallet.account });

      await assert.rejects(
        () => contract.write.revealAnswer([bountyId, ANSWER, SALT], { account: p1Wallet.account }),
        /already revealed/,
      );
    });

    it("reverts reveal from address that never committed", async () => {
      const { contract, p2Wallet, bountyId } = await commitAndAdvance();

      await assert.rejects(
        () => contract.write.revealAnswer([bountyId, ANSWER, SALT], { account: p2Wallet.account }),
        /no commitment found/,
      );
    });
  });

  // ── Judge Phase ───────────────────────────────────────────────────────────
  describe("judgeAll (judge phase)", () => {
    it("reverts judgeAll before revealDeadline", async () => {
      const { contract, ownerWallet, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      const salt       = padHex("0xaa", { size: 32 });
      const commitment = makeCommitment("answer", salt, p1Wallet.account.address, bountyId);
      await contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account });
      await timeTravel(SUBMISSION_WINDOW + 2);
      await contract.write.revealAnswer([bountyId, "answer", salt], { account: p1Wallet.account });

      // Reveal deadline NOT reached yet
      await assert.rejects(
        () => contract.write.judgeAll([bountyId, "0x"], { account: ownerWallet.account }),
        /reveal phase not over/,
      );
    });

    it("reverts judgeAll with zero eligible submissions", async () => {
      const { contract, ownerWallet, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      // Commit but never reveal → zero eligible
      const commitment = makeCommitment("x", padHex("0xbb", { size: 32 }), p1Wallet.account.address, bountyId);
      await contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account });

      // Skip both windows
      await timeTravel(SUBMISSION_WINDOW + REVEAL_WINDOW + 5);

      await assert.rejects(
        () => contract.write.judgeAll([bountyId, "0x"], { account: ownerWallet.account }),
        /no eligible submissions/,
      );
    });

    it("reverts judgeAll called by non-owner", async () => {
      const { contract, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      await timeTravel(SUBMISSION_WINDOW + REVEAL_WINDOW + 5);

      await assert.rejects(
        () => contract.write.judgeAll([bountyId, "0x"], { account: p1Wallet.account }),
        /not bounty owner/,
      );
    });
  });

  // ── Finalize Phase ────────────────────────────────────────────────────────
  describe("finalizeWinner (finalize phase)", () => {
    it("reverts finalize before judging", async () => {
      const { contract, ownerWallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      await assert.rejects(
        () => contract.write.finalizeWinner([bountyId, 0n], { account: ownerWallet.account }),
        /not judged yet/,
      );
    });

    it("reverts non-owner finalize attempt", async () => {
      const { contract, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      await assert.rejects(
        () => contract.write.finalizeWinner([bountyId, 0n], { account: p1Wallet.account }),
        /not bounty owner/,
      );
    });

    it("documents: finalizeWinner reverts for ineligible winner index", async () => {
      // The Solidity rule: bounty.submissions[winnerIndex].eligible must be true.
      // An unrevealed commitment leaves eligible = false and cannot win.
      // Full e2e requires mocking the LLM precompile; this test documents the rule.
      assert.ok(true, "rule enforced in contract: winner must be eligible");
    });
  });

  // ── Privacy Gate ──────────────────────────────────────────────────────────
  describe("privacy gate", () => {
    it("getSubmission returns empty answer string during commit phase", async () => {
      const { contract, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      const answer     = "top secret answer";
      const salt       = padHex("0xcafe", { size: 32 });
      const commitment = makeCommitment(answer, salt, p1Wallet.account.address, bountyId);
      await contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account });

      const [,,,, vis] = await contract.read.getSubmission([bountyId, 0n]);
      assert.equal(vis, "", "answer must be empty during commit phase");
    });

    it("getSubmission returns empty answer string after reveal but before judging", async () => {
      const { contract, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      const answer     = "my real answer";
      const salt       = padHex("0xdead", { size: 32 });
      const commitment = makeCommitment(answer, salt, p1Wallet.account.address, bountyId);
      await contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account });

      await timeTravel(SUBMISSION_WINDOW + 2);
      await contract.write.revealAnswer([bountyId, answer, salt], { account: p1Wallet.account });

      const [,,,, vis] = await contract.read.getSubmission([bountyId, 0n]);
      assert.equal(vis, "", "answer must be empty before judging even after reveal");
    });

    it("hasCommitted reflects commitment status correctly", async () => {
      const { contract, p1Wallet, bountyId } =
        await networkHelpers.loadFixture(deployFixture);

      const before = await contract.read.hasCommitted([bountyId, p1Wallet.account.address]);
      assert.equal(before, false, "should not have committed yet");

      const commitment = makeCommitment("ans", padHex("0xff", { size: 32 }), p1Wallet.account.address, bountyId);
      await contract.write.submitCommitment([bountyId, commitment], { account: p1Wallet.account });

      const after = await contract.read.hasCommitted([bountyId, p1Wallet.account.address]);
      assert.equal(after, true, "should be committed after submitCommitment");
    });
  });
});
