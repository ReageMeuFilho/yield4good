# Building a Yield-Donating Strategy on Octant v2: A Complete Tutorial

## Introduction

This tutorial walks you through building **Yield4Good**, a production-quality Yield-Donating Strategy (YDS) on Octant v2. You'll learn how to create an ERC-4626 vault that accepts stablecoins, generates yield, and automatically donates 100% of that yield to public goods while keeping user principal fully withdrawable.

**What You'll Build**:
- ERC-4626 compliant vault
- Pluggable yield strategy system
- Transparent donation routing
- Modern React frontend with Wagmi
- Comprehensive test suite

**Prerequisites**:
- Solidity basics
- Understanding of ERC-20 tokens
- Familiarity with Hardhat
- React and TypeScript knowledge (for frontend)

**Time to Complete**: 2-3 hours

## Table of Contents

1. [Understanding Octant v2 Concepts](#1-understanding-octant-v2-concepts)
2. [Project Setup](#2-project-setup)
3. [Building the Contracts](#3-building-the-contracts)
4. [Writing Tests](#4-writing-tests)
5. [Deployment](#5-deployment)
6. [Building the Frontend](#6-building-the-frontend)
7. [Testing End-to-End](#7-testing-end-to-end)
8. [Common Pitfalls](#8-common-pitfalls)

---

## 1. Understanding Octant v2 Concepts

### What is a Yield-Donating Strategy?

A YDS allows users to:
1. **Deposit** assets (e.g., USDC)
2. **Earn yield** on those assets (via DeFi protocols)
3. **Donate 100% of yield** to public goods
4. **Withdraw principal** anytime, fully intact

### Why ERC-4626?

ERC-4626 is the "Tokenized Vault Standard" that provides:
- **Shares**: Users receive vault tokens representing their deposit
- **Composability**: Vaults can be used as collateral, traded, etc.
- **Standardization**: Predictable interface for integrations

**Key Concepts**:
- `totalAssets()`: Total underlying assets (deposits + yield)
- `totalSupply()`: Total shares minted
- `convertToShares(assets)`: How many shares for X assets?
- `convertToAssets(shares)`: How many assets for X shares?

### Architecture Overview

```
User → Vault (ERC-4626) → Strategy (Yield Source) → DonationRouter → Beneficiary
```

**Flow**:
1. User deposits USDC into Vault
2. Vault mints shares and sends USDC to Strategy
3. Strategy invests in yield protocol (Aave, Compound, etc.)
4. Periodically, anyone calls `harvest()`
5. Strategy realizes yield and sends to Vault
6. Vault forwards yield to DonationRouter
7. DonationRouter sends to beneficiary and emits event

---

## 2. Project Setup

### Initialize Project

```bash
mkdir yield4good && cd yield4good
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox typescript ts-node
npm install @openzeppelin/contracts ethers dotenv
```

### Configure Hardhat

Create `hardhat.config.ts`:

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
    },
  },
};

export default config;
```

### Create Directory Structure

```bash
mkdir -p contracts/{interfaces,vaults,strategies,routers}
mkdir -p test scripts docs
```

---

## 3. Building the Contracts

### Step 3.1: Define Interfaces

**contracts/interfaces/IYieldStrategy.sol**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IYieldStrategy {
    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);
    function invest(uint256 amount) external;
    function divest(uint256 amount) external returns (uint256);
    function harvest() external returns (uint256 yieldAmt);
}
```

**Why this interface?**
- `asset()`: Which token does this strategy use?
- `totalAssets()`: How much is invested (principal + yield)?
- `invest()`: Vault sends capital to strategy
- `divest()`: Vault pulls capital back (for withdrawals)
- `harvest()`: Realize yield and return to vault

**contracts/interfaces/IDonationRouter.sol**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDonationRouter {
    event YieldDonated(
        address indexed asset,
        address indexed beneficiary,
        uint256 amount,
        address indexed caller
    );
    
    function donate(address asset, address beneficiary, uint256 amount) external;
}
```

### Step 3.2: Implement DonationRouter

**contracts/routers/DonationRouter.sol**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDonationRouter.sol";

contract DonationRouter is IDonationRouter {
    using SafeERC20 for IERC20;

    function donate(
        address asset,
        address beneficiary,
        uint256 amount
    ) external override {
        require(asset != address(0), "DonationRouter: zero asset address");
        require(beneficiary != address(0), "DonationRouter: zero beneficiary address");
        require(amount > 0, "DonationRouter: zero amount");

        IERC20(asset).safeTransferFrom(msg.sender, beneficiary, amount);
        emit YieldDonated(asset, beneficiary, amount, msg.sender);
    }
}
```

**Key Points**:
- Uses `SafeERC20` to handle non-standard tokens
- Emits event for transparency (indexable by frontends)
- Simple, auditable logic

### Step 3.3: Implement MockStrategy

For demos, we need a strategy with programmable yield:

**contracts/strategies/MockStrategy.sol**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IYieldStrategy.sol";

contract MockStrategy is IYieldStrategy, Ownable {
    using SafeERC20 for IERC20;

    address public immutable override asset;
    uint256 public principal;
    uint256 public simulatedYield;

    event Invested(uint256 amount);
    event Divested(uint256 amount);
    event Harvested(uint256 yieldAmount);
    event YieldSet(uint256 newYield);

    constructor(address _asset) Ownable(msg.sender) {
        require(_asset != address(0), "MockStrategy: zero asset address");
        asset = _asset;
    }

    function totalAssets() external view override returns (uint256) {
        return principal + simulatedYield;
    }

    function invest(uint256 amount) external override onlyOwner {
        require(amount > 0, "MockStrategy: zero amount");
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        principal += amount;
        emit Invested(amount);
    }

    function divest(uint256 amount) external override onlyOwner returns (uint256) {
        require(amount > 0, "MockStrategy: zero amount");
        require(amount <= principal, "MockStrategy: insufficient principal");
        principal -= amount;
        IERC20(asset).safeTransfer(msg.sender, amount);
        emit Divested(amount);
        return amount;
    }

    function harvest() external override onlyOwner returns (uint256) {
        uint256 yieldAmount = simulatedYield;
        if (yieldAmount > 0) {
            simulatedYield = 0;
            IERC20(asset).safeTransfer(msg.sender, yieldAmount);
            emit Harvested(yieldAmount);
        }
        return yieldAmount;
    }

    function setSimulatedYield(uint256 _yield) external {
        simulatedYield = _yield;
        emit YieldSet(_yield);
    }
}
```

**Why MockStrategy?**
- **Deterministic**: Set yield manually for testing
- **Transparent**: Separate `principal` and `simulatedYield` tracking
- **Owned by Vault**: Only vault can invest/divest/harvest

### Step 3.4: Implement Yield4GoodVault

**contracts/vaults/Yield4GoodVault.sol**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IYieldStrategy.sol";
import "../interfaces/IDonationRouter.sol";

contract Yield4GoodVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IYieldStrategy public strategy;
    address public donationRouter;
    address public beneficiary;
    bool public paused;
    uint256 public totalDonated;

    event Harvest(uint256 yieldAmount, address indexed beneficiary);
    event BeneficiaryChanged(address indexed newBeneficiary);
    event Paused(bool status);

    modifier whenNotPaused() {
        require(!paused, "Yield4GoodVault: paused");
        _;
    }

    constructor(
        IERC20 _asset,
        IYieldStrategy _strategy,
        address _donationRouter,
        address _beneficiary,
        string memory _name,
        string memory _symbol
    ) ERC4626(_asset) ERC20(_name, _symbol) Ownable(msg.sender) {
        require(address(_strategy) != address(0), "zero strategy");
        require(_donationRouter != address(0), "zero router");
        require(_beneficiary != address(0), "zero beneficiary");
        require(address(_asset) == _strategy.asset(), "asset mismatch");

        strategy = _strategy;
        donationRouter = _donationRouter;
        beneficiary = _beneficiary;
    }

    function totalAssets() public view virtual override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + strategy.totalAssets();
    }

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal virtual override whenNotPaused nonReentrant {
        super._deposit(caller, receiver, assets, shares);
        
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        if (balance > 0) {
            IERC20(asset()).forceApprove(address(strategy), balance);
            strategy.invest(balance);
        }
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal virtual override nonReentrant {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        
        if (assets > idle) {
            uint256 shortfall = assets - idle;
            uint256 divested = strategy.divest(shortfall);
            require(divested >= shortfall, "insufficient liquidity");
        }
        
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function harvest() external nonReentrant whenNotPaused {
        uint256 yieldAmount = strategy.harvest();
        
        if (yieldAmount > 0) {
            IERC20(asset()).forceApprove(donationRouter, yieldAmount);
            IDonationRouter(donationRouter).donate(asset(), beneficiary, yieldAmount);
            
            totalDonated += yieldAmount;
            emit Harvest(yieldAmount, beneficiary);
        }
    }

    function setBeneficiary(address _beneficiary) external onlyOwner {
        require(_beneficiary != address(0), "zero beneficiary");
        beneficiary = _beneficiary;
        emit BeneficiaryChanged(_beneficiary);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }
}
```

**Key Design Decisions**:

1. **ERC4626 Inheritance**: Provides standard vault interface
2. **ReentrancyGuard**: Prevents reentrancy attacks
3. **Pausable**: Emergency stop for deposits/harvest (withdrawals always work)
4. **Auto-Invest**: Deposits immediately go to strategy
5. **Auto-Divest**: Withdrawals pull from strategy if needed

---

## 4. Writing Tests

### Step 4.1: Setup Test Environment

**test/Yield4GoodVault.test.ts**:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { Yield4GoodVault, MockStrategy, DonationRouter, MockERC20 } from "../typechain-types";

describe("Yield4GoodVault", function () {
  let vault: Yield4GoodVault;
  let strategy: MockStrategy;
  let router: DonationRouter;
  let mockToken: MockERC20;
  let owner, user1, beneficiary;

  beforeEach(async function () {
    [owner, user1, beneficiary] = await ethers.getSigners();

    // Deploy mock USDC
    const ERC20Factory = await ethers.getContractFactory("MockERC20");
    mockToken = await ERC20Factory.deploy("Mock USDC", "USDC", 6);

    // Deploy router
    const RouterFactory = await ethers.getContractFactory("DonationRouter");
    router = await RouterFactory.deploy();

    // Deploy strategy
    const StrategyFactory = await ethers.getContractFactory("MockStrategy");
    strategy = await StrategyFactory.deploy(await mockToken.getAddress());

    // Deploy vault
    const VaultFactory = await ethers.getContractFactory("Yield4GoodVault");
    vault = await VaultFactory.deploy(
      await mockToken.getAddress(),
      await strategy.getAddress(),
      await router.getAddress(),
      beneficiary.address,
      "Yield4Good Vault",
      "Y4G"
    );

    // Transfer strategy ownership to vault
    await strategy.transferOwnership(await vault.getAddress());

    // Mint tokens to user
    await mockToken.mint(user1.address, ethers.parseUnits("10000", 6));
  });

  it("Should allow deposit and mint shares", async function () {
    const amount = ethers.parseUnits("1000", 6);
    await mockToken.connect(user1).approve(await vault.getAddress(), amount);
    await vault.connect(user1).deposit(amount, user1.address);

    expect(await vault.balanceOf(user1.address)).to.be.gt(0);
    expect(await strategy.principal()).to.equal(amount);
  });

  it("Should harvest yield and donate", async function () {
    // Deposit
    const amount = ethers.parseUnits("1000", 6);
    await mockToken.connect(user1).approve(await vault.getAddress(), amount);
    await vault.connect(user1).deposit(amount, user1.address);

    // Simulate yield
    const yieldAmount = ethers.parseUnits("50", 6);
    await mockToken.mint(await strategy.getAddress(), yieldAmount);
    await strategy.setSimulatedYield(yieldAmount);

    // Harvest
    await expect(vault.harvest())
      .to.emit(vault, "Harvest")
      .withArgs(yieldAmount, beneficiary.address);

    expect(await mockToken.balanceOf(beneficiary.address)).to.equal(yieldAmount);
    expect(await vault.totalDonated()).to.equal(yieldAmount);
  });

  it("Should preserve user principal after harvest", async function () {
    const amount = ethers.parseUnits("1000", 6);
    await mockToken.connect(user1).approve(await vault.getAddress(), amount);
    await vault.connect(user1).deposit(amount, user1.address);

    const sharesBefore = await vault.balanceOf(user1.address);

    // Simulate and harvest yield
    const yieldAmount = ethers.parseUnits("50", 6);
    await mockToken.mint(await strategy.getAddress(), yieldAmount);
    await strategy.setSimulatedYield(yieldAmount);
    await vault.harvest();

    const sharesAfter = await vault.balanceOf(user1.address);
    expect(sharesAfter).to.equal(sharesBefore); // Shares unchanged
  });
});
```

### Step 4.2: Run Tests

```bash
npx hardhat test
```

**Expected Output**:
```
  Yield4GoodVault
    ✔ Should allow deposit and mint shares
    ✔ Should harvest yield and donate
    ✔ Should preserve user principal after harvest
```

---

## 5. Deployment

### Step 5.1: Create Deployment Script

**scripts/deploy.ts**:

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const assetAddress = process.env.ASSET_ADDRESS!;
  const beneficiaryAddress = process.env.BENEFICIARY_ADDRESS!;

  // 1. Deploy Router
  const Router = await ethers.getContractFactory("DonationRouter");
  const router = await Router.deploy();
  await router.waitForDeployment();
  console.log("DonationRouter:", await router.getAddress());

  // 2. Deploy Strategy
  const Strategy = await ethers.getContractFactory("MockStrategy");
  const strategy = await Strategy.deploy(assetAddress);
  await strategy.waitForDeployment();
  console.log("MockStrategy:", await strategy.getAddress());

  // 3. Deploy Vault
  const Vault = await ethers.getContractFactory("Yield4GoodVault");
  const vault = await Vault.deploy(
    assetAddress,
    await strategy.getAddress(),
    await router.getAddress(),
    beneficiaryAddress,
    "Yield4Good Vault",
    "Y4G"
  );
  await vault.waitForDeployment();
  console.log("Yield4GoodVault:", await vault.getAddress());

  // 4. Transfer ownership
  await strategy.transferOwnership(await vault.getAddress());
  console.log("✅ Strategy ownership transferred");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

### Step 5.2: Deploy to Testnet

```bash
# Set environment variables
export ALCHEMY_API_KEY=your_key
export SEPOLIA_PRIVATE_KEY=your_private_key
export ASSET_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238  # Sepolia USDC
export BENEFICIARY_ADDRESS=your_beneficiary_wallet

# Deploy
npx hardhat run scripts/deploy.ts --network sepolia
```

---

## 6. Building the Frontend

### Step 6.1: Setup React App

```bash
npm create vite@latest app -- --template react-ts
cd app
npm install wagmi viem@2.x @tanstack/react-query @rainbow-me/rainbowkit
```

### Step 6.2: Configure Wagmi

**app/src/wagmi.ts**:

```typescript
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Yield4Good',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains: [sepolia],
});
```

### Step 6.3: Create Dashboard Component

**app/src/components/Dashboard.tsx**:

```typescript
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import VaultABI from '../contracts/Yield4GoodVault.json';

const VAULT_ADDRESS = '0x...'; // Your deployed vault

export default function Dashboard() {
  const { address } = useAccount();

  const { data: totalAssets } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VaultABI,
    functionName: 'totalAssets',
  });

  const { data: userShares } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VaultABI,
    functionName: 'balanceOf',
    args: [address],
  });

  const { writeContract: harvest } = useWriteContract();

  return (
    <div>
      <ConnectButton />
      <h1>Total Assets: {totalAssets?.toString()}</h1>
      <h2>Your Shares: {userShares?.toString()}</h2>
      <button onClick={() => harvest({
        address: VAULT_ADDRESS,
        abi: VaultABI,
        functionName: 'harvest',
      })}>
        Harvest Yield
      </button>
    </div>
  );
}
```

---

## 7. Testing End-to-End

### Step 7.1: Get Testnet Tokens

1. Get Sepolia ETH from [faucet](https://sepoliafaucet.com/)
2. Get test USDC from [Aave faucet](https://staging.aave.com/faucet/)

### Step 7.2: Test Flow

1. **Connect Wallet**: Use MetaMask on Sepolia
2. **Approve USDC**: Allow vault to spend your USDC
3. **Deposit**: Deposit 100 USDC
4. **Simulate Yield**: Call `strategy.setSimulatedYield(10000000)` (10 USDC)
5. **Harvest**: Click "Harvest Yield" button
6. **Verify**: Check beneficiary wallet received 10 USDC
7. **Withdraw**: Redeem your shares, get 100 USDC back

---

## 8. Common Pitfalls

### Pitfall 1: Forgetting to Transfer Strategy Ownership

**Problem**: Vault can't call `strategy.invest()` because it's not the owner.

**Solution**: Always transfer ownership after deployment:
```solidity
await strategy.transferOwnership(vaultAddress);
```

### Pitfall 2: Allowance Issues

**Problem**: `transferFrom` fails even after approval.

**Solution**: Use `forceApprove` (sets to 0 then amount):
```solidity
IERC20(asset).forceApprove(spender, amount);
```

### Pitfall 3: Rounding Errors in Share Calculation

**Problem**: Users get slightly fewer assets than expected on withdrawal.

**Solution**: Use ERC-4626's preview functions and add tolerance in tests:
```typescript
expect(assetsAfter).to.be.closeTo(assetsBefore, tolerance);
```

### Pitfall 4: Not Handling Zero Yield

**Problem**: Harvest reverts when no yield available.

**Solution**: Check yield amount before transferring:
```solidity
if (yieldAmount > 0) {
    // ... donate
}
```

### Pitfall 5: Pausing Withdrawals

**Problem**: Users can't access funds during emergency.

**Solution**: Exempt withdrawals from `whenNotPaused`:
```solidity
function _withdraw(...) internal override nonReentrant {
    // No whenNotPaused modifier
}
```

---

## Conclusion

You've built a complete Yield-Donating Strategy on Octant v2! Key takeaways:

1. **ERC-4626** provides a standard vault interface
2. **Pluggable strategies** enable flexible yield sources
3. **Transparent donations** via events and routers
4. **Comprehensive testing** ensures security
5. **Modern frontend** makes it user-friendly

### Next Steps

- Deploy to mainnet with Aave strategy
- Add beneficiary governance
- Implement DonorProofNFT
- Build subgraph for analytics

### Resources

- [ERC-4626 Spec](https://eips.ethereum.org/EIPS/eip-4626)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Wagmi Docs](https://wagmi.sh/)
- [Octant Docs](https://docs.octant.app/)

Happy building! 🚀
