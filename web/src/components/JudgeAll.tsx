"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain } from "wagmi";
import aiJudgeProAbi from "@/abi/AIBountyJudgePro";
import { contractAddress, executorAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canJudge, type CommitRevealBounty } from "@/lib/bounty";
import { buildJudgeAllLlmInput, type JudgeSubmission } from "@/lib/ritualLlm";
import { useWriteTx } from "@/hooks/useWriteTx";
import { useRitualWalletStatus } from "@/hooks/useRitualWalletStatus";
import { RitualWalletPanel } from "@/components/RitualWalletPanel";
import { Card, CardHeader, CardBody, Button, TxStatus, Notice, Spinner } from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function JudgeAll({
  bountyId,
  bounty,
  isOwner,
  onJudged,
}: {
  bountyId: bigint;
  bounty: CommitRevealBounty;
  isOwner: boolean;
  onJudged: () => void;
}) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const [gathering, setGathering] = useState(false);
  const [gatherError, setGatherError] = useState<string | null>(null);

  // Track whether a judgeAll tx has been submitted but the LLM callback
  // hasn't landed yet (bounty.judged is still false). This window can take
  // 1-5 min on Ritual, so we lock the button to prevent duplicate submissions.
  const [judgeSubmitted, setJudgeSubmitted] = useState(false);

  // Stable callback — useCallback ensures useWriteTx's internal ref update
  // effect never fires from a reference change alone.
  const onJudgedStable = useCallback(() => onJudged(), [onJudged]);
  const tx = useWriteTx(onJudgedStable);

  // Preflight the *connected* wallet's RitualWallet funding (not the bounty
  // contract) — judgeAll spends prepaid+locked RITUAL via the LLM precompile.
  const walletStatus = useRitualWalletStatus(address);

  const count = Number(bounty.totalEligible);
  const now   = Date.now() / 1000;

  // Gate: owner only, has eligible submissions, reveal deadline passed, not judged.
  if (!isOwner || bounty.judged || bounty.finalized || !canJudge(bounty, now)) {
    return null;
  }

  const isWrongChain = chainId !== ritualChain.id;

  async function handleJudge() {
    if (isWrongChain) {
      switchChain({ chainId: ritualChain.id });
      return;
    }
    if (!publicClient || !contractAddress || !walletStatus.ready) return;
    setGatherError(null);
    setGathering(true);
    try {
      // Use getEligibleAnswers — the dedicated owner-only function that returns
      // all eligible submissions with their real plaintext answers after
      // revealDeadline. Using getSubmission() was the bug: its privacy gate
      // returned empty strings before bounty.judged was true, so the LLM
      // received empty submissions and correctly scored them 0.
      const result = await publicClient.readContract({
        address: contractAddress,
        abi: aiJudgeProAbi,
        functionName: "getEligibleAnswers",
        args: [bountyId],
        account: address,
      });

      const [submitters, answers, indices] = result as [
        `0x${string}`[],
        string[],
        bigint[],
      ];

      const submissions: JudgeSubmission[] = submitters.map((submitter, i) => ({
        index: Number(indices[i]),
        submitter,
        answer: answers[i],
      })).filter(s => s.answer.trim().length > 0);

      if (submissions.length === 0) {
        throw new Error("No eligible submissions found. Ensure the reveal deadline has passed and at least one submission was correctly revealed.");
      }

      // 3–4. Build the batch judging prompt and encode the Ritual LLM request.
      const llmInput = buildJudgeAllLlmInput({
        executorAddress,
        title: bounty.title,
        rubric: bounty.rubric,
        submissions,
      });

      setGathering(false);

      // 5. Submit it on-chain. Mark submitted immediately so the button stays
      // locked even after the initial tx confirms — bounty.judged won't flip
      // until the Ritual LLM callback arrives (can take 1-5 min).
      setJudgeSubmitted(true);
      await tx.run({
        address: contractAddress,
        abi: aiJudgeProAbi,
        functionName: "judgeAll",
        args: [bountyId, llmInput],
        chainId: ritualChain.id,
        gas: 10_000_000n,
      });
    } catch (e) {
      setGathering(false);
      // Only clear the submitted flag on a pre-submission error (wallet reject,
      // gather failure). If the tx was already sent, keep the button locked.
      if (!tx.hash) setJudgeSubmitted(false);
      setGatherError(
        (e as { shortMessage?: string; message?: string }).shortMessage ||
          (e as Error).message ||
          "Failed to gather submissions.",
      );
    }
  }

  // The judgeAll transaction calls the Ritual LLM precompile. The Ritual block
  // builder pauses the transaction to run the LLM inference inside the TEE,
  // meaning the transaction itself takes 1-5 minutes to be mined!
  // We should show the "processing" notice as soon as the transaction is sent
  // to the network (tx.state === "pending" or judgeSubmitted).
  const awaitingLlm = judgeSubmitted && tx.state !== "failed" && !bounty.judged;
  const busy = gathering || tx.isBusy || awaitingLlm;
  const fundingReady = walletStatus.ready === true;

  return (
    <Card>
      <CardHeader
        title="Judge all submissions"
        subtitle="Sends one Ritual LLM request ranking every submission."
      />
      <CardBody className="space-y-3">
        <Notice tone="indigo">AI review is advisory. The bounty owner finalizes the winner.</Notice>

        <RitualWalletPanel status={walletStatus} onDeposited={walletStatus.refetch} />

        {/* While waiting for the Ritual LLM callback, show an informational
            notice so the user knows not to re-click. This window lasts
            until the block-builder finishes TEE inference (1-5 min). */}
        {awaitingLlm && (
          <Notice tone="amber">
            <span className="flex items-center gap-2">
              <Spinner />
              <span>
                <strong>Ritual AI is processing…</strong> The block builder is running LLM
                inference inside the TEE. This normally takes <strong>1–5 minutes</strong>.
                Do <strong>not</strong> submit again — your transaction is already queued.
              </span>
            </span>
          </Notice>
        )}

        <Button onClick={handleJudge} disabled={busy || !fundingReady || isWrongChain} className="w-full">
          {isWrongChain ? (
            "Switch wallet to Ritual Chain"
          ) : gathering ? (
            <>
              <Spinner /> Gathering {count} submissions…
            </>
          ) : tx.isBusy ? (
            <><Spinner /> Judging…</>
          ) : awaitingLlm ? (
            <><Spinner /> Waiting for Ritual AI result…</>
          ) : !fundingReady ? (
            "Fund RitualWallet to judge"
          ) : (
            `Judge eligible answers (${count})`
          )}
        </Button>

        {/* Allow retry only on explicit failure, with a reset link */}
        {tx.state === "failed" && (
          <button
            onClick={() => { tx.reset(); setJudgeSubmitted(false); setGatherError(null); }}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            Clear error and try again
          </button>
        )}

        {gatherError && <Notice tone="red">{gatherError}</Notice>}
        <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
      </CardBody>
    </Card>
  );
}
