import { encodeFunctionData } from "viem";
import abi from "../web/src/abi/AIJudgeCommitReveal.ts";
import { buildJudgeAllLlmInput } from "../web/src/lib/ritualLlm.ts";

async function main() {
  const account = "0xC041a38fEa40dbBD93786BfE553944a20c0eeF01";
  const target = "0x225774C8f359659706dA7EBF48C8f5e2620D69c2";
  const executor = "0xB42e435c4252A5a2E7440e37B609F00c61a0c91B";
  const bountyId = 1n;

  // We know the submissions are:
  const submissions = [{
    index: 0,
    submitter: "0xC041a38fEa40dbBD93786BfE553944a20c0eeF01",
    answer: "blockchain is a distributed ledger"
  }];

  const title = "Best explanation of blockchain";
  const rubric = "Score submissions based on:\\n- Accuracy (50%)\\n- Clarity (30%)\\n- Simplicity for beginners (20%)\\n\\nChoose the answer that explains blockchain most clearly and correctly.";

  const llmInput = buildJudgeAllLlmInput({
    executorAddress: executor as any,
    title,
    rubric,
    submissions,
  });

  const data = encodeFunctionData({
    abi: (abi as any).default || abi,
    functionName: "judgeAll",
    args: [bountyId, llmInput],
  });

  const payload = {
    jsonrpc: "2.0",
    method: "eth_estimateGas",
    params: [{
      from: account,
      to: target,
      data: data
    }],
    id: 1
  };

  const res = await fetch("https://rpc.ritualfoundation.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  console.log("Response:", JSON.stringify(json, null, 2));
}

main().catch(console.error);
