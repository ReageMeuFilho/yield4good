import { expect } from "chai";
import { ethers } from "hardhat";
import { MockStrategy, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MockStrategy", function () {
  let mockStrategy: MockStrategy;
  let mockToken: MockERC20;
  let owner: SignerWithAddress;
  let vault: SignerWithAddress;
  let user: SignerWithAddress;

  beforeEach(async function () {
    [owner, vault, user] = await ethers.getSigners();

    const ERC20Factory = await ethers.getContractFactory("MockERC20");
    mockToken = await ERC20Factory.deploy("Mock USDC", "USDC", 6);
    await mockToken.waitForDeployment();

    const MockStrategyFactory = await ethers.getContractFactory("MockStrategy");
    mockStrategy = await MockStrategyFactory.deploy(await mockToken.getAddress());
    await mockStrategy.waitForDeployment();

    await mockToken.mint(vault.address, ethers.parseUnits("10000", 6));
  });

  describe("Deployment", function () {
    it("Should set the correct asset", async function () {
      expect(await mockStrategy.asset()).to.equal(await mockToken.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await mockStrategy.owner()).to.equal(owner.address);
    });

    it("Should initialize with zero principal and yield", async function () {
      expect(await mockStrategy.principal()).to.equal(0);
      expect(await mockStrategy.simulatedYield()).to.equal(0);
      expect(await mockStrategy.totalAssets()).to.equal(0);
    });
  });

  describe("Invest", function () {
    it("Should allow owner to invest", async function () {
      const amount = ethers.parseUnits("1000", 6);
      
      await mockStrategy.transferOwnership(vault.address);
      await mockToken.connect(vault).approve(await mockStrategy.getAddress(), amount);
      
      await expect(mockStrategy.connect(vault).invest(amount))
        .to.emit(mockStrategy, "Invested")
        .withArgs(amount);

      expect(await mockStrategy.principal()).to.equal(amount);
      expect(await mockStrategy.totalAssets()).to.equal(amount);
    });

    it("Should revert if non-owner tries to invest", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockToken.connect(vault).approve(await mockStrategy.getAddress(), amount);
      
      await expect(mockStrategy.connect(vault).invest(amount))
        .to.be.revertedWithCustomError(mockStrategy, "OwnableUnauthorizedAccount");
    });

    it("Should revert on zero amount", async function () {
      await expect(mockStrategy.invest(0))
        .to.be.revertedWith("MockStrategy: zero amount");
    });
  });

  describe("Divest", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockStrategy.transferOwnership(vault.address);
      await mockToken.connect(vault).approve(await mockStrategy.getAddress(), amount);
      await mockStrategy.connect(vault).invest(amount);
    });

    it("Should allow owner to divest", async function () {
      const amount = ethers.parseUnits("500", 6);
      
      await expect(mockStrategy.connect(vault).divest(amount))
        .to.emit(mockStrategy, "Divested")
        .withArgs(amount);

      expect(await mockStrategy.principal()).to.equal(ethers.parseUnits("500", 6));
    });

    it("Should revert if divesting more than principal", async function () {
      const amount = ethers.parseUnits("2000", 6);
      
      await expect(mockStrategy.connect(vault).divest(amount))
        .to.be.revertedWith("MockStrategy: insufficient principal");
    });

    it("Should revert if non-owner tries to divest", async function () {
      await expect(mockStrategy.connect(user).divest(ethers.parseUnits("100", 6)))
        .to.be.revertedWithCustomError(mockStrategy, "OwnableUnauthorizedAccount");
    });
  });

  describe("Harvest", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockStrategy.transferOwnership(vault.address);
      await mockToken.connect(vault).approve(await mockStrategy.getAddress(), amount);
      await mockStrategy.connect(vault).invest(amount);
    });

    it("Should harvest simulated yield", async function () {
      const yieldAmount = ethers.parseUnits("50", 6);
      
      await mockToken.mint(await mockStrategy.getAddress(), yieldAmount);
      await mockStrategy.connect(vault).setSimulatedYield(yieldAmount);

      const vaultBalanceBefore = await mockToken.balanceOf(vault.address);
      
      await expect(mockStrategy.connect(vault).harvest())
        .to.emit(mockStrategy, "Harvested")
        .withArgs(yieldAmount);

      expect(await mockStrategy.simulatedYield()).to.equal(0);
      expect(await mockToken.balanceOf(vault.address)).to.equal(vaultBalanceBefore + yieldAmount);
    });

    it("Should return zero if no yield", async function () {
      const result = await mockStrategy.connect(vault).harvest.staticCall();
      expect(result).to.equal(0);
    });

    it("Should not affect principal", async function () {
      const yieldAmount = ethers.parseUnits("50", 6);
      await mockToken.mint(await mockStrategy.getAddress(), yieldAmount);
      await mockStrategy.connect(vault).setSimulatedYield(yieldAmount);

      const principalBefore = await mockStrategy.principal();
      await mockStrategy.connect(vault).harvest();
      
      expect(await mockStrategy.principal()).to.equal(principalBefore);
    });
  });

  describe("SetSimulatedYield", function () {
    it("Should allow owner to set simulated yield", async function () {
      const yieldAmount = ethers.parseUnits("100", 6);
      
      await expect(mockStrategy.setSimulatedYield(yieldAmount))
        .to.emit(mockStrategy, "YieldSet")
        .withArgs(yieldAmount);

      expect(await mockStrategy.simulatedYield()).to.equal(yieldAmount);
    });

    it("Should update totalAssets", async function () {
      const investAmount = ethers.parseUnits("1000", 6);
      const yieldAmount = ethers.parseUnits("50", 6);
      
      await mockStrategy.transferOwnership(vault.address);
      await mockToken.connect(vault).approve(await mockStrategy.getAddress(), investAmount);
      await mockStrategy.connect(vault).invest(investAmount);
      await mockStrategy.connect(vault).setSimulatedYield(yieldAmount);

      expect(await mockStrategy.totalAssets()).to.equal(investAmount + yieldAmount);
    });
  });
});
