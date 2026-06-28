"use client";

import { useCallback } from "react";
import { useAccount } from "wagmi";
import { useProBounty } from "@/hooks/useProBounty";
import { isAddressEqual } from "@/lib/format";
import { decodeAiReview } from "@/lib/aiReview";
import { getCRBountyStatus, CR_STATUS_META } from "@/lib/bounty";
import { BountyDetail } from "@/components/BountyDetail";
import { SubmitCommitment } from "@/components/SubmitCommitment";
import { RevealAnswer } from "@/components/RevealAnswer";
import { JudgeAll } from "@/components/JudgeAll";
import { FinalizeWinner } from "@/components/FinalizeWinner";
import { AIReviewDisplay } from "@/components/AIReviewDisplay";
import { CommitmentsList } from "@/components/CommitmentsList";
import { Card, CardBody, Notice, Spinner } from "@/components/ui";
import { useNow } from "@/hooks/useNow";

export function BountyView({ bountyId }: { bountyId: bigint }) {
  const { address } = useAccount();
  const now = useNow();
  const { bounty, isLoading, isError, refetch } = useProBounty(bountyId);

  const reload = useCallback(() => { void refetch(); }, [refetch]);

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Spinner /> Loading bounty #{bountyId.toString()}…
          </div>
        </CardBody>
      </Card>
    );
  }

  if (isError || !bounty) {
    return (
      <Notice tone="red">
        Couldn&apos;t load bounty #{bountyId.toString()}. Check the id and that the
        contract address / RPC are configured correctly.
      </Notice>
    );
  }

  if (/^0x0+$/.test(bounty.owner)) {
    return <Notice tone="amber">Bounty #{bountyId.toString()} doesn&apos;t exist.</Notice>;
  }

  const isOwner    = isAddressEqual(address, bounty.owner);
  const judge      = decodeAiReview(bounty.aiReview)?.parsed ?? null;
  const status     = getCRBountyStatus(bounty, now / 1000);
  const statusMeta = CR_STATUS_META[status];

  return (
    <div className="space-y-4">
      {/* Phase banner */}
      <div className={`rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-2
        ${status === "commit-open"   ? "bg-green-500/10  text-green-300  ring-1 ring-green-500/20"  : ""}
        ${status === "reveal-open"   ? "bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/20" : ""}
        ${status === "judging-ready" ? "bg-amber-500/10  text-amber-300  ring-1 ring-amber-500/20"  : ""}
        ${status === "judged"        ? "bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20" : ""}
        ${status === "finalized"     ? "bg-zinc-500/10   text-zinc-300   ring-1 ring-zinc-500/20"   : ""}
      `}>
        <span className="text-lg">
          {status === "commit-open"   ? "🔒" :
           status === "reveal-open"   ? "🔓" :
           status === "judging-ready" ? "⚖️" :
           status === "judged"        ? "🤖" : "🏆"}
        </span>
        <div>
          <span className="font-semibold">{statusMeta.label}</span>
          <span className="ml-2 font-normal opacity-70">
            {status === "commit-open"   && "Submit your commitment hash before the deadline."}
            {status === "reveal-open"   && "The commit window is closed. Reveal your answer now."}
            {status === "judging-ready" && "Reveal window closed. Owner can trigger AI judging."}
            {status === "judged"        && "AI judging complete. Owner can finalize the winner."}
            {status === "finalized"     && "Bounty complete. Winner has been paid."}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: details + actions */}
        <div className="space-y-4">
          <BountyDetail bountyId={bountyId} bounty={bounty} isOwner={isOwner} />
          <SubmitCommitment bountyId={bountyId} bounty={bounty} onCommitted={reload} />
          <RevealAnswer     bountyId={bountyId} bounty={bounty} onRevealed={reload} />
          <JudgeAll         bountyId={bountyId} bounty={bounty} isOwner={isOwner} onJudged={reload} />
          <FinalizeWinner   bountyId={bountyId} bounty={bounty} isOwner={isOwner} onFinalized={reload} />
        </div>

        {/* Right: AI review + submissions */}
        <div className="space-y-4">
          {bounty.judged && <AIReviewDisplay aiReview={bounty.aiReview} />}
          <CommitmentsList
            bountyId={bountyId}
            bounty={bounty}
            judge={judge}
            finalWinner={bounty.finalized ? Number(bounty.winnerIndex) : undefined}
          />
        </div>
      </div>
    </div>
  );
}
