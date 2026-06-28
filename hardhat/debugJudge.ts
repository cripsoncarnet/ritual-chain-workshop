import { createPublicClient, http, encodeFunctionData } from "viem";

import abi from "../web/src/abi/AIJudgeCommitReveal.ts";
import { buildJudgeAllLlmInput } from "../web/src/lib/ritualLlm.ts";

const ritualChain = {
  id: 1979,
  name: "Ritual Chain",
  nativeCurrency: { name: "Ritual", symbol: "RITUAL", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.ritualfoundation.org"] },
  },
} as const;

const client = createPublicClient({
  chain: ritualChain,
  transport: http(),
});

async function main() {
  const account = "0xC041a38fEa40dbBD93786BfE553944a20c0eeF01";
  const target = "0x225774C8f359659706dA7EBF48C8f5e2620D69c2";
  const executor = "0xB42e435c4252A5a2E7440e37B609F00c61a0c91B";
  const bountyId = 1n; // from screenshot

  console.log("Reading eligible submissions...");
  const submissions = [];
  const [owner, title, rubric, reward, subTs, revTs, judged, finalized, totalComm, totalRev, totalEligible] = await client.readContract({
    address: target,
    abi: (abi as any).default || abi,
    functionName: "getBounty",
    args: [bountyId],
  });

  for (let i = 0; i < Number(totalComm); i++) {
    const [submitter, , , eligible, answer] = await client.readContract({
      address: target,
      abi: (abi as any).default || abi,
      functionName: "getSubmission",
      args: [bountyId, BigInt(i)],
    });
    if (eligible) {
      submissions.push({ index: i, submitter, answer });
    }
  }

  console.log(`Found ${submissions.length} eligible submissions`);

  const llmInput = buildJudgeAllLlmInput({
    executorAddress: executor,
    title,
    rubric,
    submissions,
  });

  console.log("Estimating gas for judgeAll...");
  try {
    const res = await client.call({
      to: target as any,
      data: encodeFunctionData({
        abi: (abi as any).default || abi,
        functionName: "judgeAll",
        args: [bountyId, llmInput],
      }),
      account: account as any,
    });
    console.log("Call successful! Result:", res.data);
  } catch (err: any) {
    console.error("Call failed:");
    console.error(err.details || err.shortMessage || err.message || err);
  }
}

main().catch(console.error);
