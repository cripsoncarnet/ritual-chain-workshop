// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrecompileConsumer} from "./utils/PrecompileConsumer.sol";

/**
 * @title AIJudgeCommitReveal
 * @notice Privacy-preserving AI bounty judge using a commit-reveal scheme.
 *
 * Lifecycle
 * ---------
 *   1. COMMIT phase  (now → submissionDeadline)
 *      Participants submit keccak256(answer ++ salt ++ sender ++ bountyId).
 *      Answers are NOT on-chain yet.
 *
 *   2. REVEAL phase  (submissionDeadline → revealDeadline)
 *      Participants reveal their plaintext answer + salt.
 *      The contract verifies the hash matches the stored commitment.
 *      Only valid reveals become eligible for judging.
 *
 *   3. JUDGE phase   (after revealDeadline)
 *      Owner calls judgeAll() — one Ritual LLM call for ALL eligible answers.
 *      Answer text is hidden from getSubmission() until this step completes.
 *
 *   4. FINALIZE      (after judging)
 *      Owner picks a winner (advised by AI). Contract pays the reward.
 *
 * Commitment formula (must match off-chain computation):
 *   bytes32 commitment = keccak256(
 *       abi.encodePacked(answer, salt, msg.sender, bountyId)
 *   );
 * Including msg.sender and bountyId prevents cross-participant commitment
 * copying and cross-bounty replay attacks.
 */
contract AIJudgeCommitReveal is PrecompileConsumer {
    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MAX_SUBMISSIONS  = 10;
    uint256 public constant MAX_ANSWER_LENGTH = 2_000;

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 public nextBountyId = 1;

    struct Submission {
        address submitter;
        bytes32 commitment;  // always stored
        string  answer;      // empty until revealed
        bytes32 saltHash;    // keccak256(salt) — for off-chain verification aid
        bool    revealed;
        bool    eligible;    // true only after a valid reveal
    }

    struct Bounty {
        address owner;
        string  title;
        string  rubric;
        uint256 reward;
        uint256 submissionDeadline; // commit phase closes
        uint256 revealDeadline;     // reveal phase closes, judging may begin
        bool    judged;
        bool    finalized;
        bytes   aiReview;
        uint256 winnerIndex;
        Submission[] submissions;
        // track one commitment per address
        mapping(address => bool)    hasCommitted;
        mapping(address => uint256) submissionIndex; // address → array index
    }

    struct ConvoHistory {
        string storageType;
        string path;
        string secretsName;
    }

    mapping(uint256 => Bounty) public bounties;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed owner,
        string  title,
        uint256 reward,
        uint256 submissionDeadline,
        uint256 revealDeadline
    );

    event CommitmentSubmitted(
        uint256 indexed bountyId,
        uint256 indexed submissionIndex,
        address indexed submitter
    );

    event AnswerRevealed(
        uint256 indexed bountyId,
        uint256 indexed submissionIndex,
        address indexed submitter,
        bool    eligible
    );

    event AllAnswersJudged(uint256 indexed bountyId, bytes aiReview);

    event WinnerFinalized(
        uint256 indexed bountyId,
        uint256 indexed winnerIndex,
        address indexed winner,
        uint256 reward
    );

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner(uint256 bountyId) {
        require(msg.sender == bounties[bountyId].owner, "not bounty owner");
        _;
    }

    modifier bountyExists(uint256 bountyId) {
        require(bounties[bountyId].owner != address(0), "bounty not found");
        _;
    }

    // ─── Setup ────────────────────────────────────────────────────────────────

    /**
     * @notice Create a new bounty.
     * @param title              Human-readable bounty title.
     * @param rubric             Criteria the AI will judge against.
     * @param submissionDeadline Unix timestamp when the commit window closes.
     * @param revealDeadline     Unix timestamp when the reveal window closes
     *                           (must be > submissionDeadline).
     */
    function createBounty(
        string  calldata title,
        string  calldata rubric,
        uint256 submissionDeadline,
        uint256 revealDeadline
    ) external payable returns (uint256 bountyId) {
        require(msg.value > 0, "reward required");
        require(submissionDeadline > block.timestamp, "submission deadline must be in future");
        require(revealDeadline > submissionDeadline, "reveal deadline must follow submission deadline");

        bountyId = nextBountyId++;

        Bounty storage bounty = bounties[bountyId];
        bounty.owner              = msg.sender;
        bounty.title              = title;
        bounty.rubric             = rubric;
        bounty.reward             = msg.value;
        bounty.submissionDeadline = submissionDeadline;
        bounty.revealDeadline     = revealDeadline;
        bounty.winnerIndex        = type(uint256).max;

        emit BountyCreated(
            bountyId,
            msg.sender,
            title,
            msg.value,
            submissionDeadline,
            revealDeadline
        );
    }

    // ─── Phase 1: Commit ──────────────────────────────────────────────────────

    /**
     * @notice Submit a commitment hash (the answer is NOT revealed yet).
     * @param bountyId   Target bounty.
     * @param commitment keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
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
        require(bounty.submissions.length < MAX_SUBMISSIONS, "too many submissions");
        require(commitment != bytes32(0), "empty commitment");

        uint256 idx = bounty.submissions.length;
        bounty.submissions.push(
            Submission({
                submitter:  msg.sender,
                commitment: commitment,
                answer:     "",
                saltHash:   bytes32(0),
                revealed:   false,
                eligible:   false
            })
        );

        bounty.hasCommitted[msg.sender]    = true;
        bounty.submissionIndex[msg.sender] = idx;

        emit CommitmentSubmitted(bountyId, idx, msg.sender);
    }

    // ─── Phase 2: Reveal ─────────────────────────────────────────────────────

    /**
     * @notice Reveal the plaintext answer behind a commitment.
     *         The contract verifies keccak256(answer ++ salt ++ sender ++ bountyId)
     *         matches the stored commitment. Valid reveals become eligible for judging.
     * @param bountyId Target bounty.
     * @param answer   Plaintext answer (must match the committed hash).
     * @param salt     Random bytes32 used when hashing the commitment.
     */
    function revealAnswer(
        uint256        bountyId,
        string calldata answer,
        bytes32        salt
    ) external bountyExists(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp >= bounty.submissionDeadline, "reveal phase not started");
        require(block.timestamp <  bounty.revealDeadline,     "reveal phase closed");
        require(!bounty.judged,    "already judged");
        require(!bounty.finalized, "already finalized");
        require(bounty.hasCommitted[msg.sender], "no commitment found");
        require(bytes(answer).length > 0,              "answer cannot be empty");
        require(bytes(answer).length <= MAX_ANSWER_LENGTH, "answer too long");

        uint256 idx = bounty.submissionIndex[msg.sender];
        Submission storage sub = bounty.submissions[idx];

        require(!sub.revealed, "already revealed");

        // ── Core security check ──────────────────────────────────────────────
        // Binding msg.sender and bountyId into the hash means:
        //   • A participant cannot use someone else's commitment.
        //   • The same answer+salt pair is invalid on a different bounty.
        bytes32 expected = keccak256(
            abi.encodePacked(answer, salt, msg.sender, bountyId)
        );
        bool valid = (expected == sub.commitment);

        sub.revealed  = true;
        sub.eligible  = valid;

        if (valid) {
            sub.answer   = answer;
            sub.saltHash = keccak256(abi.encodePacked(salt)); // for audit trail
        }

        emit AnswerRevealed(bountyId, idx, msg.sender, valid);
    }

    // ─── Phase 3: Judge ───────────────────────────────────────────────────────

    /**
     * @notice Trigger Ritual AI batch judging of all eligible revealed answers.
     *         Only the owner may call this, only after the reveal deadline.
     *         llmInput must contain ALL eligible answers (built off-chain).
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
        require(_eligibleCount(bounty) > 0, "no eligible submissions");

        bytes memory output = _executePrecompile(
            LLM_INFERENCE_PRECOMPILE,
            llmInput
        );

        (
            bool hasError,
            bytes memory completionData,
            ,
            string memory errorMessage,

        ) = abi.decode(output, (bool, bytes, bytes, string, ConvoHistory));

        require(!hasError, errorMessage);

        bounty.judged   = true;
        bounty.aiReview = completionData;

        emit AllAnswersJudged(bountyId, completionData);
    }

    // ─── Phase 4: Finalize ────────────────────────────────────────────────────

    /**
     * @notice Finalize the bounty: choose a winner and transfer the reward.
     *         winnerIndex must correspond to an eligible submission.
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

        emit WinnerFinalized(bountyId, winnerIndex, winner, reward);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Read bounty metadata and counts.
     */
    function getBounty(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (
            address owner,
            string  memory title,
            string  memory rubric,
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

        uint256 revealed  = 0;
        uint256 eligible_ = 0;
        for (uint256 i = 0; i < bounty.submissions.length; i++) {
            if (bounty.submissions[i].revealed) revealed++;
            if (bounty.submissions[i].eligible) eligible_++;
        }

        return (
            bounty.owner,
            bounty.title,
            bounty.rubric,
            bounty.reward,
            bounty.submissionDeadline,
            bounty.revealDeadline,
            bounty.judged,
            bounty.finalized,
            bounty.submissions.length,
            revealed,
            eligible_,
            bounty.winnerIndex,
            bounty.aiReview
        );
    }

    /**
     * @notice Read a single submission.
     *         Answer text is hidden (empty string) until judging is complete.
     *         This privacy gate is the core enforcement mechanism.
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
            string  memory answer  // empty until bounty.judged == true
        )
    {
        Bounty storage bounty = bounties[bountyId];
        require(index < bounty.submissions.length, "invalid index");

        Submission storage sub = bounty.submissions[index];

        // ── Privacy gate ────────────────────────────────────────────────────
        // Reveal plaintext only after judging is complete so that no participant
        // can read rival answers before the judging phase.
        string memory visibleAnswer = bounty.judged ? sub.answer : "";

        return (
            sub.submitter,
            sub.commitment,
            sub.revealed,
            sub.eligible,
            visibleAnswer
        );
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

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    function _eligibleCount(Bounty storage bounty) internal view returns (uint256 count) {
        for (uint256 i = 0; i < bounty.submissions.length; i++) {
            if (bounty.submissions[i].eligible) count++;
        }
    }
}
