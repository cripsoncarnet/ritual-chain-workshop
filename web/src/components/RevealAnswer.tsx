"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useNow } from "@/hooks/useNow";
import { useReadContract } from "wagmi";
import aiJudgeAbi from "@/abi/AIBountyJudgePro";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canReveal, type CommitRevealBounty } from "@/lib/bounty";
import {
  loadSavedAnswer,
  clearSavedAnswer,
  computeCommitment,
} from "@/lib/commitReveal";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Textarea,
  Input,
  Button,
  TxStatus,
  Notice,
} from "@/components/ui";
import type { Address } from "viem";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function RevealAnswer({
  bountyId,
  bounty,
  onRevealed,
}: {
  bountyId: bigint;
  bounty: CommitRevealBounty;
  onRevealed: () => void;
}) {
  const { address, isConnected } = useAccount();
  const now = useNow();

  const [answer, setAnswer] = useState("");
  const [salt, setSalt]     = useState("");
  const [previewHash, setPreviewHash] = useState<string | null>(null);

  // Load saved answer + salt from localStorage on mount / address change
  useEffect(() => {
    if (!address) return;
    const saved = loadSavedAnswer(bountyId, address as Address);
    if (saved) {
      setAnswer(saved.answer);
      setSalt(saved.salt);
    }
  }, [bountyId, address]);

  // Live-preview the commitment that would be sent, so the user can verify
  useEffect(() => {
    if (!address || !answer.trim() || !salt.startsWith("0x")) {
      setPreviewHash(null);
      return;
    }
    try {
      const hash = computeCommitment(answer.trim(), salt as `0x${string}`, address as Address, bountyId);
      setPreviewHash(hash);
    } catch {
      setPreviewHash(null);
    }
  }, [answer, salt, address, bountyId]);

  // Check if this address already committed
  const { data: committed } = useReadContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName: "hasCommitted",
    args: address ? [bountyId, address] : undefined,
    chainId: ritualChain.id,
    query: { enabled: !!contractAddress && !!address },
  });

  const tx = useWriteTx(() => {
    if (address) clearSavedAnswer(bountyId, address as Address);
    onRevealed();
  });

  // Only render during the reveal phase
  if (!canReveal(bounty, now / 1000)) return null;
  // No commitment to reveal
  if (committed === false) return null;

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !salt || !contractAddress) return;
    if (!salt.startsWith("0x") || salt.length !== 66) {
      window.alert("Salt must be a valid 0x-prefixed 32-byte hex string (66 chars).");
      return;
    }
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "revealAnswer",
        args: [bountyId, answer.trim(), salt as `0x${string}`],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Reveal your answer"
        subtitle="The submission deadline has passed. Reveal your answer so it becomes eligible for judging."
      />
      <CardBody>
        <Notice tone="violet">
          Your answer was pre-filled from your browser storage. If this is a different
          browser, paste your answer and salt manually.
        </Notice>

        <form onSubmit={handleReveal} className="mt-3 space-y-3">
          <Field label="Your answer" hint="Must exactly match what you committed.">
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              placeholder="Paste your answer exactly as submitted…"
            />
          </Field>

          <Field
            label="Salt (0x…)"
            hint="The random 32-byte hex salt used when you committed."
          >
            <Input
              value={salt}
              onChange={(e) => setSalt(e.target.value)}
              placeholder="0x1234…abcd"
              className="font-mono text-xs"
            />
          </Field>

          {previewHash && (
            <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
              <p className="mb-1 text-xs text-zinc-500">Computed commitment hash preview</p>
              <p className="break-all font-mono text-xs text-zinc-300">{previewHash}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={!isConnected || !answer.trim() || !salt || tx.isBusy}
            className="w-full"
          >
            {tx.isBusy ? "Revealing…" : "Reveal answer"}
          </Button>

          {!isConnected && (
            <p className="text-xs text-zinc-500">Connect your wallet to reveal.</p>
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
