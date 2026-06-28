// SPDX-License-Identifier: MIT
// Test plan for AIBountyJudgePro — commit-reveal bounty system
// Run with: npx hardhat test

import { expect } from "chai";
import { ethers } from "hardhat";

// Helper: compute commitment hash matching the contract formula
async function computeCommitment(
  answer: string,
  salt: string,
  sender: string,
  bountyId: bigint
): Promise<string> {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["string", "bytes32", "address", "uint256"],
      [answer, salt, sender, bountyId]
    )
  );
}

describe("AIBountyJudgePro — Commit-Reveal", () => {
  let contract: any;
  let owner: any, alice: any, bob: any, carol: any;
  const REWARD = ethers.parseEther("0.01");
  const ONE_HOUR = 3600;
  const TWO_HOURS = 7200;

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("AIBountyJudgePro");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  // ─── 1. createBounty ──────────────────────────────────────────────────────

  describe("createBounty", () => {
    it("creates a bounty with correct fields", async () => {
      const now = Math.floor(Date.now() / 1000);
      const subDeadline = now + ONE_HOUR;
      const revDeadline = now + TWO_HOURS;

      const tx = await contract.connect(owner).createBounty(
        "Best DeFi explanation",
        "Correctness 50%, clarity 30%, novelty 20%",
        "DeFi",
        subDeadline,
        revDeadline,
        { value: REWARD }
      );
      await tx.wait();

      const bounty = await contract.getBounty(1n);
      expect(bounty.owner).to.equal(owner.address);
      expect(bounty.title).to.equal("Best DeFi explanation");
      expect(bounty.category).to.equal("DeFi");
      expect(bounty.reward).to.equal(REWARD);
    });

    it("reverts if no reward sent", async () => {
      const now = Math.floor(Date.now() / 1000);
      await expect(
        contract.createBounty("T", "R", "General", now + ONE_HOUR, now + TWO_HOURS, { value: 0n })
      ).to.be.revertedWith("reward required");
    });

    it("reverts if submissionDeadline is in the past", async () => {
      const now = Math.floor(Date.now() / 1000);
      await expect(
        contract.createBounty("T", "R", "General", now - 1, now + ONE_HOUR, { value: REWARD })
      ).to.be.revertedWith("submission deadline must be in future");
    });

    it("reverts if revealDeadline <= submissionDeadline", async () => {
      const now = Math.floor(Date.now() / 1000);
      await expect(
        contract.createBounty("T", "R", "General", now + ONE_HOUR, now + ONE_HOUR, { value: REWARD })
      ).to.be.revertedWith("reveal deadline must follow submission deadline");
    });
  });

  // ─── 2. submitCommitment ──────────────────────────────────────────────────

  describe("submitCommitment", () => {
    let bountyId: bigint;
    let subDeadline: number;

    beforeEach(async () => {
      const now = Math.floor(Date.now() / 1000);
      subDeadline = now + ONE_HOUR;
      await contract.connect(owner).createBounty(
        "T", "R", "General", subDeadline, subDeadline + ONE_HOUR, { value: REWARD }
      );
      bountyId = 1n;
    });

    it("accepts a valid commitment", async () => {
      const salt = ethers.randomBytes(32);
      const commitment = await computeCommitment("my answer", salt as any, alice.address, bountyId);
      await expect(
        contract.connect(alice).submitCommitment(bountyId, commitment)
      ).to.emit(contract, "CommitmentSubmitted");
    });

    it("rejects empty commitment", async () => {
      await expect(
        contract.connect(alice).submitCommitment(bountyId, ethers.ZeroHash)
      ).to.be.revertedWith("empty commitment");
    });

    it("rejects duplicate commitment from same address", async () => {
      const salt = ethers.randomBytes(32);
      const commitment = await computeCommitment("my answer", salt as any, alice.address, bountyId);
      await contract.connect(alice).submitCommitment(bountyId, commitment);
      await expect(
        contract.connect(alice).submitCommitment(bountyId, commitment)
      ).to.be.revertedWith("already committed");
    });

    it("rejects commitment after submission deadline", async () => {
      // Fast-forward past submission deadline
      await ethers.provider.send("evm_increaseTime", [ONE_HOUR + 1]);
      await ethers.provider.send("evm_mine", []);
      const salt = ethers.randomBytes(32);
      const commitment = await computeCommitment("late", salt as any, alice.address, bountyId);
      await expect(
        contract.connect(alice).submitCommitment(bountyId, commitment)
      ).to.be.revertedWith("submission phase closed");
    });
  });

  // ─── 3. revealAnswer ──────────────────────────────────────────────────────

  describe("revealAnswer", () => {
    let bountyId: bigint;
    let aliceSalt: Uint8Array;
    const ALICE_ANSWER = "DeFi is short for decentralized finance.";

    beforeEach(async () => {
      const now = Math.floor(Date.now() / 1000);
      await contract.connect(owner).createBounty(
        "T", "R", "General",
        now + ONE_HOUR,
        now + TWO_HOURS,
        { value: REWARD }
      );
      bountyId = 1n;

      aliceSalt = ethers.randomBytes(32);
      const commitment = await computeCommitment(ALICE_ANSWER, aliceSalt as any, alice.address, bountyId);
      await contract.connect(alice).submitCommitment(bountyId, commitment);

      // Advance past submission deadline into reveal window
      await ethers.provider.send("evm_increaseTime", [ONE_HOUR + 1]);
      await ethers.provider.send("evm_mine", []);
    });

    it("accepts a valid reveal — marks eligible = true", async () => {
      await expect(
        contract.connect(alice).revealAnswer(bountyId, ALICE_ANSWER, aliceSalt)
      ).to.emit(contract, "AnswerRevealed").withArgs(bountyId, 0n, alice.address, true, anyValue);
    });

    it("marks eligible = false for wrong answer", async () => {
      // Bob reveals wrong answer (won't match alice's commitment)
      const bobSalt = ethers.randomBytes(32);
      await contract.connect(bob).submitCommitment(
        bountyId,
        await computeCommitment("correct answer", bobSalt as any, bob.address, bountyId)
      );
      // Bob tries to reveal a DIFFERENT answer — should fail hash check → eligible = false
      // (we need another commitment first)
      // This tests the wrong-answer path
      await expect(
        contract.connect(alice).revealAnswer(bountyId, "wrong answer", aliceSalt)
      ).to.emit(contract, "AnswerRevealed").withArgs(bountyId, 0n, alice.address, false, anyValue);
    });

    it("rejects reveal before submission deadline", async () => {
      // Deploy fresh bounty and try to reveal immediately (before commit window closes)
      const now = Math.floor(Date.now() / 1000);
      await contract.connect(owner).createBounty(
        "T2", "R2", "General",
        now + TWO_HOURS,
        now + TWO_HOURS + ONE_HOUR,
        { value: REWARD }
      );
      const salt2 = ethers.randomBytes(32);
      const c2 = await computeCommitment("answer", salt2 as any, alice.address, 2n);
      await contract.connect(alice).submitCommitment(2n, c2);
      await expect(
        contract.connect(alice).revealAnswer(2n, "answer", salt2)
      ).to.be.revertedWith("reveal phase not started");
    });

    it("rejects reveal after reveal deadline", async () => {
      // Advance past reveal deadline
      await ethers.provider.send("evm_increaseTime", [ONE_HOUR + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        contract.connect(alice).revealAnswer(bountyId, ALICE_ANSWER, aliceSalt)
      ).to.be.revertedWith("reveal phase closed");
    });

    it("rejects double reveal", async () => {
      await contract.connect(alice).revealAnswer(bountyId, ALICE_ANSWER, aliceSalt);
      await expect(
        contract.connect(alice).revealAnswer(bountyId, ALICE_ANSWER, aliceSalt)
      ).to.be.revertedWith("already revealed");
    });

    it("rejects reveal from address that never committed", async () => {
      await expect(
        contract.connect(carol).revealAnswer(bountyId, "any", aliceSalt)
      ).to.be.revertedWith("no commitment found");
    });

    it("privacy gate: answer hidden before judging", async () => {
      await contract.connect(alice).revealAnswer(bountyId, ALICE_ANSWER, aliceSalt);
      const sub = await contract.getSubmission(bountyId, 0n);
      // Answer should be hidden (empty) before judging
      expect(sub.answer).to.equal("");
      expect(sub.revealed).to.be.true;
      expect(sub.eligible).to.be.true;
    });
  });

  // ─── 4. Commitment formula — cross-participant replay prevention ──────────

  describe("Commitment formula — replay attack prevention", () => {
    it("rejects Alice using Bob's commitment bytes for the same bounty", async () => {
      const now = Math.floor(Date.now() / 1000);
      await contract.connect(owner).createBounty(
        "T", "R", "General",
        now + ONE_HOUR,
        now + TWO_HOURS,
        { value: REWARD }
      );

      const salt = ethers.randomBytes(32);
      // Bob creates a commitment legitimately
      const bobCommitment = await computeCommitment("great answer", salt as any, bob.address, 1n);
      await contract.connect(bob).submitCommitment(1n, bobCommitment);

      // Alice submits the SAME commitment bytes (copying Bob's hash)
      await contract.connect(alice).submitCommitment(1n, bobCommitment);

      // Move to reveal window
      await ethers.provider.send("evm_increaseTime", [ONE_HOUR + 1]);
      await ethers.provider.send("evm_mine", []);

      // Alice tries to reveal with Bob's answer+salt → will NOT match because
      // the formula binds msg.sender (alice != bob), so eligible = false
      await expect(
        contract.connect(alice).revealAnswer(1n, "great answer", salt)
      ).to.emit(contract, "AnswerRevealed").withArgs(1n, 1n, alice.address, false, anyValue);
    });
  });

  // ─── 5. getContractInfo ───────────────────────────────────────────────────

  describe("getContractInfo", () => {
    it("returns version, deployer, and bounty count", async () => {
      const info = await contract.getContractInfo();
      expect(info.version).to.equal("2.0.0-commit-reveal");
      expect(info.deployerAddr).to.equal(owner.address);
      expect(info.totalBounties).to.equal(0n);
    });
  });
});

// Mocha helper (anyValue matcher)
function anyValue() { return true; }
