"use client";

import { useReadContract } from "wagmi";
import aiJudgeProAbi from "@/abi/AIBountyJudgePro";
import { contractAddress, isContractConfigured } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { parseCRBounty, type CommitRevealBounty } from "@/lib/bounty";

/**
 * Hook for reading AIBountyJudgePro v2 (commit-reveal) bounties.
 * getBounty() returns: owner, title, rubric, category, reward,
 *   submissionDeadline, revealDeadline, judged, finalized,
 *   totalCommitted, totalRevealed, totalEligible, winnerIndex, aiReview
 * This maps directly to CommitRevealBounty (we drop category for now — it's
 * displayed via BountyDetail via its own slot).
 */
export function useProBounty(bountyId?: bigint) {
  const enabled = bountyId !== undefined && isContractConfigured;

  const query = useReadContract({
    address: contractAddress,
    abi: aiJudgeProAbi,
    functionName: "getBounty",
    args: bountyId !== undefined ? [bountyId] : undefined,
    chainId: ritualChain.id,
    query: {
      enabled,
      refetchInterval: 5_000,
    },
  });

  // getBounty returns 14-element tuple; parseCRBountyPro maps it
  const bounty: (CommitRevealBounty & { category: string }) | undefined = query.data
    ? parseCRBountyPro(query.data as any)
    : undefined;

  return {
    bounty,
    isLoading: query.isLoading,
    isError:   query.isError,
    error:     query.error,
    refetch:   query.refetch,
  };
}

/**
 * Map the 14-element getBounty tuple from AIBountyJudgePro v2 to a typed object.
 * Positions: owner(0), title(1), rubric(2), category(3), reward(4),
 *   submissionDeadline(5), revealDeadline(6), judged(7), finalized(8),
 *   totalCommitted(9), totalRevealed(10), totalEligible(11), winnerIndex(12), aiReview(13)
 */
function parseCRBountyPro(raw: readonly unknown[]): CommitRevealBounty & { category: string } {
  const [
    owner, title, rubric, category, reward,
    submissionDeadline, revealDeadline,
    judged, finalized,
    totalCommitted, totalRevealed, totalEligible,
    winnerIndex, aiReview,
  ] = raw as [
    `0x${string}`, string, string, string, bigint,
    bigint, bigint, boolean, boolean,
    bigint, bigint, bigint, bigint, `0x${string}`,
  ];
  return {
    owner, title, rubric, category, reward,
    submissionDeadline, revealDeadline,
    judged, finalized,
    totalCommitted, totalRevealed, totalEligible,
    winnerIndex, aiReview,
  };
}
