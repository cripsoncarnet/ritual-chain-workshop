import { createPublicClient, http, parseEther } from "viem";

import abi from "../web/src/abi/AIJudgeCommitReveal.ts";

// redefine ritual chain just in case
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
  const account = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // just an example
  const target = "0x225774C8f359659706dA7EBF48C8f5e2620D69c2";
  
  const block = await client.getBlock();
  console.log("Current block timestamp:", block.timestamp);

  const subTs = BigInt(Math.floor(new Date("2026-06-24T14:00").getTime() / 1000));
  const revTs = BigInt(Math.floor(new Date("2026-06-24T15:00").getTime() / 1000));
  console.log("subTs:", subTs);
  console.log("revTs:", revTs);

  try {
    const gas = await client.estimateContractGas({
      address: target,
      abi: abi,
      functionName: "createBounty",
      args: ["Best explanation", "Rubric", subTs, revTs],
      value: parseEther("0.001"),
      account,
    });
    console.log("Gas estimation successful:", gas);
  } catch (error) {
    console.error("Gas estimation failed:");
    console.error(error);
  }
}

main().catch(console.error);
