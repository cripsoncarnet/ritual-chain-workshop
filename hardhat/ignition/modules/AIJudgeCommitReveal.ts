import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Ignition deployment module for AIJudgeCommitReveal.
 *
 * Deploy to Ritual devnet:
 *   npx hardhat ignition deploy ignition/modules/AIJudgeCommitReveal.ts --network ritual
 *
 * After deploying, copy the contract address to:
 *   web/.env.local  →  NEXT_PUBLIC_CONTRACT_ADDRESS=<address>
 */
export default buildModule("AIJudgeCommitRevealModule", (m) => {
  const aiJudgeCommitReveal = m.contract("AIJudgeCommitReveal");

  return { aiJudgeCommitReveal };
});
