import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const assetAddress = process.env.ASSET_ADDRESS;
  const beneficiaryAddress = process.env.BENEFICIARY_ADDRESS;

  if (!assetAddress) {
    throw new Error("ASSET_ADDRESS environment variable is not set");
  }

  if (!beneficiaryAddress) {
    throw new Error("BENEFICIARY_ADDRESS environment variable is not set");
  }

  console.log("\n1. Deploying DonationRouter...");
  const DonationRouterFactory = await ethers.getContractFactory("DonationRouter");
  const router = await DonationRouterFactory.deploy();
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("DonationRouter deployed to:", routerAddress);

  console.log("\n2. Deploying MockStrategy...");
  const MockStrategyFactory = await ethers.getContractFactory("MockStrategy");
  const strategy = await MockStrategyFactory.deploy(assetAddress);
  await strategy.waitForDeployment();
  const strategyAddress = await strategy.getAddress();
  console.log("MockStrategy deployed to:", strategyAddress);

  console.log("\n3. Deploying Yield4GoodVault...");
  const VaultFactory = await ethers.getContractFactory("Yield4GoodVault");
  const vault = await VaultFactory.deploy(
    assetAddress,
    strategyAddress,
    routerAddress,
    beneficiaryAddress,
    "Yield4Good Vault",
    "Y4G"
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("Yield4GoodVault deployed to:", vaultAddress);

  console.log("\n4. Transferring strategy ownership to vault...");
  const tx = await strategy.transferOwnership(vaultAddress);
  await tx.wait();
  console.log("Strategy ownership transferred to vault");

  console.log("\n=== Deployment Summary ===");
  console.log("DonationRouter:", routerAddress);
  console.log("MockStrategy:", strategyAddress);
  console.log("Yield4GoodVault:", vaultAddress);
  console.log("Asset (USDC):", assetAddress);
  console.log("Beneficiary:", beneficiaryAddress);
  console.log("\nAdd these to your .env file:");
  console.log(`VAULT_ADDRESS=${vaultAddress}`);
  console.log(`STRATEGY_ADDRESS=${strategyAddress}`);
  console.log(`ROUTER_ADDRESS=${routerAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
