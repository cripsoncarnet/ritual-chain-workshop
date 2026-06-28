"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseEther, parseEventLogs } from "viem";
import { contractAddress, isContractConfigured } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import aiJudgeProAbi from "@/abi/AIBountyJudgePro";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Input,
  Textarea,
  Button,
  TxStatus,
  Notice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function defaultSubmissionDeadline() { return toDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000)); }
function defaultRevealDeadline()     { return toDatetimeLocal(new Date(Date.now() + 2 * 60 * 60 * 1000)); }

const CATEGORIES = ["General", "DeFi", "Security", "NFT", "DAO", "AI/ML", "GameFi", "Other"];

export function CreateBountyForm({ onCreated }: { onCreated?: (bountyId: bigint) => void }) {
  const { isConnected } = useAccount();
  const [title,              setTitle]              = useState("");
  const [rubric,             setRubric]             = useState("");
  const [category,           setCategory]           = useState("General");
  const [submissionDeadline, setSubmissionDeadline] = useState(defaultSubmissionDeadline());
  const [revealDeadline,     setRevealDeadline]     = useState(defaultRevealDeadline());
  const [reward,             setReward]             = useState("");
  const [createdId, setCreatedId] = useState<bigint | null>(null);

  const tx = useWriteTx((receipt) => {
    try {
      const logs = parseEventLogs({ abi: aiJudgeProAbi, eventName: "BountyCreated", logs: receipt.logs });
      const id = logs[0]?.args?.bountyId;
      if (id !== undefined) { setCreatedId(id); onCreated?.(id); }
    } catch { /* not fatal */ }
  });

  const validation = useMemo(() => {
    if (!title.trim())  return "Title is required.";
    if (!rubric.trim()) return "Rubric is required.";
    if (!submissionDeadline) return "Pick a submission deadline.";
    if (!revealDeadline)     return "Pick a reveal deadline.";
    const subTs = new Date(submissionDeadline).getTime();
    const revTs = new Date(revealDeadline).getTime();
    if (!Number.isFinite(subTs)) return "Invalid submission deadline.";
    if (!Number.isFinite(revTs)) return "Invalid reveal deadline.";
    if (revTs <= subTs) return "Reveal deadline must be after submission deadline.";
    if (reward !== "") { try { parseEther(reward); } catch { return "Reward must be a valid number."; } }
    return null;
  }, [title, rubric, submissionDeadline, revealDeadline, reward]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validation || !contractAddress) return;
    const subMs = new Date(submissionDeadline).getTime();
    const revMs = new Date(revealDeadline).getTime();
    if (subMs <= Date.now()) { window.alert("Submission deadline must be in the future."); return; }
    if (revMs <= subMs)      { window.alert("Reveal deadline must be after the submission deadline."); return; }

    // Ritual testnet (1979) uses millisecond block.timestamps
    const isRitual = ritualChain.id === 1979;
    const subTs = BigInt(isRitual ? subMs : Math.floor(subMs / 1000));
    const revTs = BigInt(isRitual ? revMs : Math.floor(revMs / 1000));

    const value = reward.trim() === "" ? 1000000000000000n : parseEther(reward.trim());
    setCreatedId(null);
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeProAbi,
        functionName: "createBounty",
        args: [title.trim(), rubric.trim(), category, subTs, revTs],
        value,
        chainId: ritualChain.id,
      });
    } catch { /* surfaced via tx.state */ }
  }

  return (
    <Card>
      <CardHeader title="Create a Bounty" subtitle="Fund a reward and define how submissions will be judged." />
      <CardBody>
        {!isContractConfigured && (
          <Notice tone="amber">
            Set <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in your{" "}
            <code className="font-mono">.env.local</code> to enable transactions.
          </Notice>
        )}
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Best gas-optimization writeup" maxLength={200} />
          </Field>
          <Field label="Rubric" hint="How submissions are scored. The AI judges only against this.">
            <Textarea value={rubric} onChange={(e) => setRubric(e.target.value)} rows={4} placeholder="Correctness 50%, clarity 30%, novelty 20%…" />
          </Field>
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-neon w-full" style={{ cursor: "pointer" }}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} style={{ background: "#0d0005", color: "#fff5e0" }}>{c}</option>
              ))}
            </select>
          </Field>

          <div className="commit-reveal-box">
            <strong>Commit-Reveal flow:</strong> Participants commit a hash before the submission
            deadline, then reveal their answer before the reveal deadline. Only valid revealed answers
            are judged — keeping submissions private until judging begins.
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Submission Deadline" hint="Commit phase closes here.">
              <Input type="datetime-local" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} />
            </Field>
            <Field label="Reveal Deadline" hint="Reveal phase closes here (must be after submission deadline).">
              <Input type="datetime-local" value={revealDeadline} onChange={(e) => setRevealDeadline(e.target.value)} />
            </Field>
          </div>

          <Field label="Reward (RITUAL)" hint="Locked in the contract on create. Min 0.001.">
            <Input type="number" min="0.001" step="any" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="0.001" />
          </Field>

          {validation && (title || rubric || reward) ? (
            <p className="text-xs text-amber-300">{validation}</p>
          ) : null}

          <Button type="submit" disabled={!isConnected || !isContractConfigured || !!validation || tx.isBusy} className="w-full">
            {tx.isBusy ? "Creating…" : "Create Bounty"}
          </Button>
          {!isConnected && <p className="text-xs text-zinc-500">Connect your wallet to create a bounty.</p>}
          <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
          {createdId !== null && (
            <Notice tone="green">
              Bounty #{createdId.toString()} created! Loaded below.
            </Notice>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
