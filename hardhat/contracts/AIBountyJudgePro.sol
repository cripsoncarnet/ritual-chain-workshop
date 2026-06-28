// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrecompileConsumer} from "./utils/PrecompileConsumer.sol";

/**
 * @title  AIBountyJudgePro
 * @notice Privacy-preserving AI bounty judge using a commit-reveal scheme,
 *         enhanced with category tags, timestamps, and Ritual AI batch judging.
 *
 * ─── Lifecycle ────────────────────────────────────────────────────────────────
 *
 *   1. CREATE   — Owner calls createBounty() with title, rubric, category,
 *                 submissionDeadline, revealDeadline, and msg.value (reward).
 *
 *   2. COMMIT   — Participants call submitCommitment() with a hash of their answer.
 *                 Formula: keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
 *                 The answer is NOT on-chain yet. Only the commitment hash is stored.
 *
 *   3. REVEAL   — After submissionDeadline, participants call revealAnswer().
 *                 The contract verifies the hash. Valid reveals become eligible.
 *                 Answers stay hidden in getSubmission() until judging completes.
 *
 *   4. JUDGE    — After revealDeadline, owner calls judgeAll() — one Ritual LLM
 *                 request batches ALL eligible answers into a single AI call.
 *
 *   5. FINALIZE — Owner calls finalizeWinner(); contract pays reward to winner.
 *
 * ─── Security Properties ──────────────────────────────────────────────────────
 *
 *   • Frontrunning prevention: Answers are committed as hashes only. No one can
 *     copy or improve another participant's answer before the deadline.
 *
 *   • Replay protection: keccak256 binds msg.sender + bountyId, so a commitment
 *     from one bounty cannot be replayed on another, nor submitted by a third party.
 *
 *   • Privacy gate: getSubmission() returns an empty answer until bounty.judged
 *     is true, preventing rivals from reading revealed answers before judging.
 *
 *   • Batch LLM: A single Ritual AI call judges ALL eligible answers together,
 *     reducing cost and ensuring consistent, comparative scoring.
 *
 * ─── Differences from base AIJudge ───────────────────────────────────────────
 *   • MAX_SUBMISSIONS = 15 (up from 10)
 *   • New `category` field on bounties (e.g. "DeFi", "Security", "AI/ML")
 *   • Timestamps on events (submittedAt, judgedAt, finalizedAt)
 *   • constructor() tracks deployer address
 *   • getContractInfo() helper for UI display

 *
 * @author Student assignment — Ritual Chain Workshop, 2026

 */
contract AIBountyJudgePro is PrecompileConsumer {

    // ── Constants ──────────────────────────────────────────────────────────────
    uint256 public constant MAX_SUBMISSIONS   = 15;       // increased from 10
    uint256 public constant MAX_ANSWER_LENGTH = 2_000;
    string  public constant CONTRACT_VERSION  = "2.0.0-commit-reveal";

    // ── State ──────────────────────────────────────────────────────────────────
    uint256 public nextBountyId = 1;
    address public deployer;

    struct Submission {
        address submitter;
        bytes32 commitment;  // always stored (phase 2)
        string  answer;      // empty until revealed and judged
        bytes32 saltHash;    // keccak256(salt) — for audit trail
        bool    revealed;
        bool    eligible;    // true only after a valid reveal
        uint256 committedAt;
        uint256 revealedAt;
    }

    struct Bounty {
        address      owner;
        string       title;
        string       rubric;
        string       category;           // e.g. "DeFi", "Security", "AI/ML"
        uint256      reward;
        uint256      submissionDeadline; // commit phase closes
        uint256      revealDeadline;     // reveal phase closes, judging may begin
        bool         judged;
        bool         finalized;
        bytes        aiReview;
        uint256      winnerIndex;
        Submission[] submissions;
        // one commitment per address
        mapping(address => bool)    hasCommitted;
        mapping(address => uint256) submissionIndex;
    }

    struct ConvoHistory {
        string storageType;
        string path;
        string secretsName;
    }

    mapping(uint256 => Bounty) public bounties;

    // ── Events ─────────────────────────────────────────────────────────────────
    event BountyCreated(
        uint256 indexed bountyId,
        address indexed owner,
        string  title,
        string  category,
        uint256 reward,
        uint256 submissionDeadline,
        uint256 revealDeadline
    );

    event CommitmentSubmitted(
        uint256 indexed bountyId,
        uint256 indexed submissionIndex,
        address indexed submitter,
        uint256 timestamp
    );

    event AnswerRevealed(
        uint256 indexed bountyId,
        uint256 indexed submissionIndex,
        address indexed submitter,
        bool    eligible,
        uint256 timestamp
    );

    event AllAnswersJudged(
        uint256 indexed bountyId,
        bytes   aiReview,
        uint256 eligibleCount,
        uint256 timestamp
    );

    event WinnerFinalized(
        uint256 indexed bountyId,
        uint256 indexed winnerIndex,
        address indexed winner,
        uint256 reward,
        uint256 timestamp
    );

    // ── Modifiers ──────────────────────────────────────────────────────────────
    modifier onlyOwner(uint256 bountyId) {
        require(msg.sender == bounties[bountyId].owner, "not bounty owner");
        _;
    }

    modifier bountyExists(uint256 bountyId) {
        require(bounties[bountyId].owner != address(0), "bounty not found");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────────
    constructor() {
        deployer = msg.sender;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 0 — Create
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Create a new bounty with commit-reveal lifecycle.
     * @param title              Human-readable bounty title.
     * @param rubric             Criteria the AI will judge against.
     * @param category           Optional category tag (e.g. "DeFi", "Security").
     * @param submissionDeadline Unix timestamp when the commit window closes.
     * @param revealDeadline     Unix timestamp when the reveal window closes
     *                           (must be > submissionDeadline).
     */
    function createBounty(
        string  calldata title,
        string  calldata rubric,
        string  calldata category,
        uint256 submissionDeadline,
        uint256 revealDeadline
    ) external payable returns (uint256 bountyId) {
        require(msg.value > 0,                     "reward required");
        require(submissionDeadline > block.timestamp, "submission deadline must be in future");
        require(revealDeadline > submissionDeadline,  "reveal deadline must follow submission deadline");

        bountyId = nextBountyId++;

        Bounty storage bounty = bounties[bountyId];
        bounty.owner              = msg.sender;
        bounty.title              = title;
        bounty.rubric             = rubric;
        bounty.category           = category;
        bounty.reward             = msg.value;
        bounty.submissionDeadline = submissionDeadline;
        bounty.revealDeadline     = revealDeadline;
        bounty.winnerIndex        = type(uint256).max;

        emit BountyCreated(
            bountyId, msg.sender, title, category,
            msg.value, submissionDeadline, revealDeadline
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 1 — Commit
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Submit a commitment hash. The answer is NOT revealed yet.
     * @param bountyId   Target bounty.
     * @param commitment keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
     *
     * Why include msg.sender and bountyId in the hash?
     *   — Prevents a participant from copying another's commitment and submitting it.
     *   — Prevents the same commitment being replayed on a different bounty.
     */
    function submitCommitment(
        uint256 bountyId,
        bytes32 commitment
    ) external bountyExists(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp < bounty.submissionDeadline, "submission phase closed");
        require(!bounty.judged,    "already judged");
        require(!bounty.finalized, "already finalized");
        require(!bounty.hasCommitted[msg.sender], "already committed");
        require(bounty.submissions.length < MAX_SUBMISSIONS, "submission cap reached");
        require(commitment != bytes32(0), "empty commitment");

        uint256 idx = bounty.submissions.length;
        bounty.submissions.push(Submission({
            submitter:   msg.sender,
            commitment:  commitment,
            answer:      "",
            saltHash:    bytes32(0),
            revealed:    false,
            eligible:    false,
            committedAt: block.timestamp,
            revealedAt:  0
        }));

        bounty.hasCommitted[msg.sender]    = true;
        bounty.submissionIndex[msg.sender] = idx;

        emit CommitmentSubmitted(bountyId, idx, msg.sender, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2 — Reveal
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reveal the plaintext answer behind a commitment.
     *         Verifies keccak256(answer ++ salt ++ sender ++ bountyId) matches
     *         the stored commitment. Valid reveals become eligible for judging.
     * @param bountyId Target bounty.
     * @param answer   Plaintext answer (must produce the committed hash).
     * @param salt     Random bytes32 used during commitment.
     */
    function revealAnswer(
        uint256         bountyId,
        string calldata answer,
        bytes32         salt
    ) external bountyExists(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp >= bounty.submissionDeadline, "reveal phase not started");
        require(block.timestamp <  bounty.revealDeadline,     "reveal phase closed");
        require(!bounty.judged,    "already judged");
        require(!bounty.finalized, "already finalized");
        require(bounty.hasCommitted[msg.sender], "no commitment found");
        require(bytes(answer).length > 0,               "answer cannot be empty");
        require(bytes(answer).length <= MAX_ANSWER_LENGTH, "answer too long");

        uint256 idx = bounty.submissionIndex[msg.sender];
        Submission storage sub = bounty.submissions[idx];
        require(!sub.revealed, "already revealed");

        // ── Core security verification ────────────────────────────────────────
        bytes32 expected = keccak256(
            abi.encodePacked(answer, salt, msg.sender, bountyId)
        );
        bool valid = (expected == sub.commitment);

        sub.revealed    = true;
        sub.eligible    = valid;
        sub.revealedAt  = block.timestamp;

        if (valid) {
            sub.answer   = answer;
            sub.saltHash = keccak256(abi.encodePacked(salt));
        }

        emit AnswerRevealed(bountyId, idx, msg.sender, valid, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 3 — Judge
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Trigger Ritual AI batch judging of all eligible revealed answers.
     *         Only the bounty owner may call this, only after revealDeadline.
     *         llmInput must encode ALL eligible answers into ONE LLM request.
     * @param bountyId Target bounty.
     * @param llmInput ABI-encoded Ritual LLM precompile request payload.
     */
    function judgeAll(
        uint256 bountyId,
        bytes calldata llmInput
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp >= bounty.revealDeadline, "reveal phase not over");
        require(!bounty.judged,    "already judged");
        require(!bounty.finalized, "already finalized");

        uint256 eligible = _eligibleCount(bounty);
        require(eligible > 0, "no eligible submissions");

        bytes memory output = _executePrecompile(
            LLM_INFERENCE_PRECOMPILE,
            llmInput
        );

        (
            bool   hasError,
            bytes  memory completionData,
            ,
            string memory errorMessage,
        ) = abi.decode(output, (bool, bytes, bytes, string, ConvoHistory));

        require(!hasError, errorMessage);

        bounty.judged   = true;
        bounty.aiReview = completionData;

        emit AllAnswersJudged(bountyId, completionData, eligible, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 4 — Finalize
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Finalize the bounty: choose a winner and transfer the reward.
     *         winnerIndex must correspond to an eligible (revealed + valid) submission.
     * @param bountyId    Target bounty.
     * @param winnerIndex Index into the submissions array (must be eligible).
     */
    function finalizeWinner(
        uint256 bountyId,
        uint256 winnerIndex
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(bounty.judged,     "not judged yet");
        require(!bounty.finalized, "already finalized");
        require(winnerIndex < bounty.submissions.length, "invalid index");
        require(bounty.submissions[winnerIndex].eligible, "winner not eligible");

        bounty.finalized   = true;
        bounty.winnerIndex = winnerIndex;

        address winner = bounty.submissions[winnerIndex].submitter;
        uint256 reward = bounty.reward;
        bounty.reward  = 0;

        (bool ok, ) = payable(winner).call{value: reward}("");
        require(ok, "payment failed");

        emit WinnerFinalized(bountyId, winnerIndex, winner, reward, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Read bounty metadata and phase counters.
     */
    function getBounty(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (
            address owner,
            string  memory title,
            string  memory rubric,
            string  memory category,
            uint256 reward,
            uint256 submissionDeadline,
            uint256 revealDeadline,
            bool    judged,
            bool    finalized,
            uint256 totalCommitted,
            uint256 totalRevealed,
            uint256 totalEligible,
            uint256 winnerIndex,
            bytes   memory aiReview
        )
    {
        Bounty storage bounty = bounties[bountyId];

        uint256 revealed_  = 0;
        uint256 eligible_  = 0;
        for (uint256 i = 0; i < bounty.submissions.length; i++) {
            if (bounty.submissions[i].revealed) revealed_++;
            if (bounty.submissions[i].eligible) eligible_++;
        }

        return (
            bounty.owner,
            bounty.title,
            bounty.rubric,
            bounty.category,
            bounty.reward,
            bounty.submissionDeadline,
            bounty.revealDeadline,
            bounty.judged,
            bounty.finalized,
            bounty.submissions.length,
            revealed_,
            eligible_,
            bounty.winnerIndex,
            bounty.aiReview
        );
    }

    /**
     * @notice Read a single submission.
     *         Answer text is hidden during the commit and reveal phases.
     *         Once the reveal deadline has passed, answers become visible — the
     *         privacy purpose (preventing frontrunning) is fully served by then.
     */
    function getSubmission(uint256 bountyId, uint256 index)
        external
        view
        bountyExists(bountyId)
        returns (
            address submitter,
            bytes32 commitment,
            bool    revealed,
            bool    eligible,
            string  memory answer,
            uint256 committedAt,
            uint256 revealedAt
        )
    {
        Bounty storage bounty = bounties[bountyId];
        require(index < bounty.submissions.length, "invalid index");

        Submission storage sub = bounty.submissions[index];

        // ── Privacy gate ──────────────────────────────────────────────────────
        // Hide answers during commit and reveal phases to prevent frontrunning.
        // After revealDeadline passes, answers are visible:
        //   - The judging frontend must read them to build the LLM prompt.
        //   - No further submission is possible, so there is nothing to frontrun.
        // Answers remain hidden for non-revealed submissions regardless of phase.
        bool revealWindowClosed = block.timestamp >= bounty.revealDeadline;
        string memory visibleAnswer = (revealWindowClosed || bounty.judged) ? sub.answer : "";

        return (
            sub.submitter,
            sub.commitment,
            sub.revealed,
            sub.eligible,
            visibleAnswer,
            sub.committedAt,
            sub.revealedAt
        );
    }

    /**
     * @notice Owner-only: returns all eligible submissions with their answers.
     *         Callable only after revealDeadline so the frontend can build the
     *         LLM judging prompt without hitting the privacy gate.
     * @param bountyId Target bounty.
     * @return submitters  Address of each eligible submitter.
     * @return answers     Plaintext answer of each eligible submission.
     * @return indices     Original submission index in the submissions array.
     */
    function getEligibleAnswers(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (
            address[] memory submitters,
            string[]  memory answers,
            uint256[] memory indices
        )
    {
        Bounty storage bounty = bounties[bountyId];
        require(msg.sender == bounty.owner, "only owner");
        require(block.timestamp >= bounty.revealDeadline, "reveal phase not over");

        uint256 n = bounty.submissions.length;
        uint256 eligibleCount = 0;
        for (uint256 i = 0; i < n; i++) {
            if (bounty.submissions[i].eligible) eligibleCount++;
        }

        submitters = new address[](eligibleCount);
        answers    = new string[](eligibleCount);
        indices    = new uint256[](eligibleCount);

        uint256 j = 0;
        for (uint256 i = 0; i < n; i++) {
            if (bounty.submissions[i].eligible) {
                submitters[j] = bounty.submissions[i].submitter;
                answers[j]    = bounty.submissions[i].answer;
                indices[j]    = i;
                j++;
            }
        }
    }

    /**
     * @notice Check whether a specific address has already committed.
     */
    function hasCommitted(uint256 bountyId, address participant)
        external
        view
        bountyExists(bountyId)
        returns (bool)
    {
        return bounties[bountyId].hasCommitted[participant];
    }

    /**
     * @notice Returns basic contract metadata for UI display.
     */
    function getContractInfo()
        external
        view
        returns (
            string  memory version,
            address deployerAddr,
            uint256 totalBounties
        )
    {
        return (CONTRACT_VERSION, deployer, nextBountyId - 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _eligibleCount(Bounty storage bounty) internal view returns (uint256 count) {
        for (uint256 i = 0; i < bounty.submissions.length; i++) {
            if (bounty.submissions[i].eligible) count++;
        }
    }
}
