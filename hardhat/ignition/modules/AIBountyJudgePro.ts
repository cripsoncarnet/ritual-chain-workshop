import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AIBountyJudgeProModule", (m) => {
  const aiJudgePro = m.contract("AIBountyJudgePro");

  return { aiJudgePro };
});
