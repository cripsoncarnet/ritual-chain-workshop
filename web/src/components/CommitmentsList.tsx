"use client";

import { useReadContract } from "wagmi";
import aiJudgeAbi from "@/abi/AIBountyJudgePro";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import type { JudgeResult } from "@/lib/aiReview";
import type { CommitRevealBounty } from "@/lib/bounty";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui";

export function CommitmentsList({
  bountyId,
  bounty,
  judge,
  finalWinner,
}: {
  bountyId: bigint;
  bounty: CommitRevealBounty;
  judge?: JudgeResult | null;
  finalWinner?: number;
}) {
  const count = Number(bounty.totalCommitted);
  const indices = Array.from({ length: count }, (_, i) => i);
  const nowSec = Date.now() / 1000;

  // Answers are visible once the reveal window closes (matches contract privacy gate).
  // Previously used bounty.judged only — which caused judging to receive empty strings.
  const revealWindowClosed =
    bounty.revealDeadline > 0n && nowSec >= Number(bounty.revealDeadline);
  const showAnswers = bounty.judged || revealWindowClosed;

  const subtitle = bounty.judged
    ? "Answers are now visible — judging is complete."
    : revealWindowClosed
    ? `Reveal window closed. ${bounty.totalRevealed} revealed, ${bounty.totalEligible} eligible for judging.`
    : bounty.totalRevealed > 0n
    ? `${bounty.totalRevealed} revealed, ${bounty.totalEligible} eligible for judging.`
    : "Answers are hidden until judging completes.";

  return (
    <Card>
      <CardHeader
        title="Submissions"
        subtitle={subtitle}
        action={
          <div className="flex items-center gap-1.5">
            <Badge tone="zinc">{count} committed</Badge>
            {bounty.totalEligible > 0n && (
              <Badge tone="indigo">{bounty.totalEligible.toString()} eligible</Badge>
            )}
          </div>
        }
      />
      <CardBody className="space-y-3">
        {count === 0 ? (
          <p className="text-sm text-zinc-500">No commitments yet.</p>
        ) : (
          indices.map((i) => (
            <CommitmentRow
              key={i}
              bountyId={bountyId}
              index={i}
              showAnswer={showAnswers}
              ranking={judge?.ranking?.find((r) => r.index === i)}
              recommended={judge?.winnerIndex === i}
              isWinner={finalWinner === i}
            />
          ))
        )}
      </CardBody>
    </Card>
  );
}

function CommitmentRow({
  bountyId,
  index,
  showAnswer,
  ranking,
  recommended,
  isWinner,
}: {
  bountyId:    bigint;
  index:       number;
  showAnswer:  boolean;
  ranking?:    { index: number; score: number; reason: string };
  recommended?: boolean;
  isWinner?:   boolean;
}) {
  const { data, isLoading } = useReadContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName: "getSubmission",
    args: [bountyId, BigInt(index)],
    chainId: ritualChain.id,
    query: { enabled: !!contractAddress },
  });

  const submitter  = data?.[0];
  const commitment = data?.[1];
  const revealed   = data?.[2];
  const eligible   = data?.[3];
  const answer     = data?.[4];

  const borderClass = isWinner
    ? "border-emerald-500/40 bg-emerald-500/5"
    : recommended
    ? "border-indigo-500/40 bg-indigo-500/5"
    : "border-white/10 bg-black/20";

  return (
    <div className={`rounded-xl border p-3 ${borderClass}`}>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">#{index}</span>
          <span className="font-mono text-sm text-zinc-300">
            {submitter ? shortenAddress(submitter) : isLoading ? "loading…" : "—"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Reveal status badges */}
          {revealed === true && eligible === true && (
            <Badge tone="green">Revealed ✓</Badge>
          )}
          {revealed === true && eligible === false && (
            <Badge tone="amber">Invalid reveal</Badge>
          )}
          {revealed === false && (
            <Badge tone="zinc">Not revealed</Badge>
          )}
          {/* Score / winner badges */}
          {ranking && <Badge tone="zinc">score {ranking.score}</Badge>}
          {isWinner ? (
            <Badge tone="green">Winner 🏆</Badge>
          ) : recommended ? (
            <Badge tone="indigo">AI pick</Badge>
          ) : null}
        </div>
      </div>

      {/* Commitment hash — always visible */}
      {commitment && (
        <p className="mt-2 break-all font-mono text-[10px] text-zinc-600" title="Commitment hash">
          {commitment}
        </p>
      )}

      {/* Answer / status message */}
      {showAnswer && answer ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-200">{answer}</p>
      ) : showAnswer && eligible ? (
        <p className="mt-2 text-xs text-zinc-500 italic">Answer not available.</p>
      ) : !showAnswer && (revealed || eligible) ? (
        <p className="mt-2 text-xs text-zinc-600 italic">
          🔒 Answer hidden until judging completes.
        </p>
      ) : !revealed && !eligible ? (
        <p className="mt-2 text-xs text-amber-700/70 italic">
          ⚠ Participant did not reveal — ineligible for judging.
        </p>
      ) : null}

      {/* AI reasoning */}
      {ranking?.reason && (
        <p className="mt-2 border-t border-white/5 pt-2 text-xs text-zinc-400">
          <span className="text-zinc-500">AI: </span>
          {ranking.reason}
        </p>
      )}
    </div>
  );
}
