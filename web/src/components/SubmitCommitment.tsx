"use client";

import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useNow } from "@/hooks/useNow";
import aiJudgeAbi from "@/abi/AIBountyJudgePro";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canCommit, type CommitRevealBounty } from "@/lib/bounty";
import { computeCommitment, generateSalt, saveAnswerLocally } from "@/lib/commitReveal";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Textarea,
  Button,
  TxStatus,
  Notice,
} from "@/components/ui";
import type { Address } from "viem";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function SubmitCommitment({
  bountyId,
  bounty,
  onCommitted,
}: {
  bountyId: bigint;
  bounty: CommitRevealBounty;
  onCommitted: () => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const now = useNow();
  const [answer, setAnswer] = useState("");
  const [saved, setSaved] = useState(false);

  const tx = useWriteTx(() => {
    setSaved(false);
    setAnswer("");
    onCommitted();
  });

  const isWrongChain = isConnected && chainId !== ritualChain.id;

  // Only render during the commit phase
  if (!canCommit(bounty, now / 1000)) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isWrongChain) {
      switchChain({ chainId: ritualChain.id });
      return;
    }
    if (!answer.trim() || !address || !contractAddress) return;

    const salt = generateSalt();
    const commitment = computeCommitment(
      answer.trim(),
      salt,
      address as Address,
      bountyId,
    );

    // Save locally BEFORE sending tx so the user can reveal even if page refreshes
    saveAnswerLocally(bountyId, address as Address, answer.trim(), salt);
    setSaved(true);

    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "submitCommitment",
        args: [bountyId, commitment],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Submit your answer (commit)"
        subtitle="Only a hash is stored on-chain — your answer stays private until the reveal phase."
      />
      <CardBody>
        <Notice tone="indigo">
          <strong>How it works:</strong> Your answer is hashed with a random salt before
          being sent on-chain. No one can read it until after the submission deadline. Your
          answer and salt are saved in your browser so you can reveal later.
        </Notice>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <Field
            label="Your answer"
            hint="Write your best answer. It will be hidden until the reveal phase."
          >
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              placeholder="Write your submission here…"
            />
          </Field>

          {saved && (
            <Notice tone="amber">
              ⚠️ Your answer and salt have been saved to this browser. Make sure to
              reveal from this same browser after the submission deadline, or back up the
              data from the Reveal panel.
            </Notice>
          )}

          <Button
            type="submit"
            disabled={!isConnected || !answer.trim() || tx.isBusy}
            className="w-full"
          >
            {tx.isBusy ? "Committing…" : "Commit answer (hash only)"}
          </Button>

          {!isConnected && (
            <p className="text-xs text-zinc-500">Connect your wallet to commit.</p>
          )}

          <TxStatus
            state={tx.state}
            error={tx.error}
            hash={tx.hash}
            explorerBase={explorerBase}
          />
        </form>
      </CardBody>
    </Card>
  );
}
