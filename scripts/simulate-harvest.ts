import { ethers } from "hardhat";

async function main() {
  const vaultAddress = process.env.VAULT_ADDRESS;
  const strategyAddress = process.env.STRATEGY_ADDRESS;
  const simulatedYield = process.env.SIMULATED_YIELD || ethers.parseUnits("10", 6).toString();

  if (!vaultAddress) {
    throw new Error("VAULT_ADDRESS environment variable is not set");
  }

  if (!strategyAddress) {
    throw new Error("STRATEGY_ADDRESS environment variable is not set");
  }

  console.log("Simulating harvest with:");
  console.log("Vault:", vaultAddress);
  console.log("Strategy:", strategyAddress);
  console.log("Simulated Yield:", ethers.formatUnits(simulatedYield, 6), "USDC");

  const strategy = await ethers.getContractAt("MockStrategy", strategyAddress);
  const vault = await ethers.getContractAt("Yield4GoodVault", vaultAddress);

  console.log("\n1. Setting simulated yield on strategy...");
  const setYieldTx = await strategy.setSimulatedYield(simulatedYield);
  await setYieldTx.wait();
  console.log("Simulated yield set");

  console.log("\n2. Getting vault state before harvest...");
  const totalDonatedBefore = await vault.totalDonated();
  const beneficiary = await vault.beneficiary();
  console.log("Total donated before:", ethers.formatUnits(totalDonatedBefore, 6), "USDC");
  console.log("Beneficiary:", beneficiary);

  console.log("\n3. Calling harvest...");
  const harvestTx = await vault.harvest();
  const receipt = await harvestTx.wait();
  console.log("Harvest transaction:", receipt?.hash);

  console.log("\n4. Getting vault state after harvest...");
  const totalDonatedAfter = await vault.totalDonated();
  console.log("Total donated after:", ethers.formatUnits(totalDonatedAfter, 6), "USDC");
  console.log("Donated in this harvest:", ethers.formatUnits(totalDonatedAfter - totalDonatedBefore, 6), "USDC");

  console.log("\n✅ Harvest simulation complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
