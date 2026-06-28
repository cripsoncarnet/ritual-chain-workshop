"use client";

import type { CommitRevealBounty } from "@/lib/bounty";
import { getCRBountyStatus, CR_STATUS_META } from "@/lib/bounty";
import { useNow } from "@/hooks/useNow";
import { shortenAddress, formatReward, formatTimestamp, formatRelative } from "@/lib/format";
import { Card, CardHeader, CardBody, Badge, Stat } from "@/components/ui";

export function BountyDetail({
  bountyId,
  bounty,
  isOwner,
}: {
  bountyId: bigint;
  bounty: CommitRevealBounty & { category?: string };
  isOwner: boolean;
}) {
  const now    = useNow();
  const status = getCRBountyStatus(bounty, now / 1000);
  const meta   = CR_STATUS_META[status];

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-zinc-500">#{bountyId.toString()}</span>
            <span className="normal-case text-base text-zinc-100">
              {bounty.title || "Untitled"}
            </span>
          </span>
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {isOwner && <Badge tone="indigo">You own this</Badge>}
            {(bounty as any).category && (bounty as any).category !== "General" && (
              <Badge tone="violet">{(bounty as any).category}</Badge>
            )}
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
        }
      />
      <CardBody className="space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Rubric</div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-200">
            {bounty.rubric || "—"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Reward"    value={formatReward(bounty.reward)} />
          <Stat label="Committed" value={bounty.totalCommitted.toString()} />
          <Stat label="Revealed"  value={bounty.totalRevealed.toString()} />
          <Stat label="Eligible"  value={bounty.totalEligible.toString()} />
        </div>

        {/* Single deadline display */}
        <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-500">Deadline</span>
            <span className="text-zinc-200">
              {formatTimestamp(bounty.deadline)}
              <span className="ml-1 text-zinc-500">({formatRelative(bounty.deadline)})</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
            <span className="text-zinc-500">Owner</span>
            <span className="font-mono text-zinc-300">{shortenAddress(bounty.owner)}</span>
          </div>
        </div>

        {bounty.finalized && (
          <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 ring-1 ring-inset ring-emerald-500/30">
            Finalized — winner is submission{" "}
            <span className="font-mono font-semibold">#{bounty.winnerIndex.toString()}</span>.
          </div>
        )}
      </CardBody>
    </Card>
  );
}
