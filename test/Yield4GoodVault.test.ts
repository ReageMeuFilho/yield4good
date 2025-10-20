import { expect } from "chai";
import { ethers } from "hardhat";
import { Yield4GoodVault, MockStrategy, DonationRouter, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Yield4GoodVault", function () {
  let vault: Yield4GoodVault;
  let strategy: MockStrategy;
  let router: DonationRouter;
  let mockToken: MockERC20;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let beneficiary: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2, beneficiary] = await ethers.getSigners();

    const ERC20Factory = await ethers.getContractFactory("MockERC20");
    mockToken = await ERC20Factory.deploy("Mock USDC", "USDC", 6);
    await mockToken.waitForDeployment();

    const DonationRouterFactory = await ethers.getContractFactory("DonationRouter");
    router = await DonationRouterFactory.deploy();
    await router.waitForDeployment();

    const MockStrategyFactory = await ethers.getContractFactory("MockStrategy");
    strategy = await MockStrategyFactory.deploy(await mockToken.getAddress());
    await strategy.waitForDeployment();

    const VaultFactory = await ethers.getContractFactory("Yield4GoodVault");
    vault = await VaultFactory.deploy(
      await mockToken.getAddress(),
      await strategy.getAddress(),
      await router.getAddress(),
      beneficiary.address,
      "Yield4Good Vault",
      "Y4G"
    );
    await vault.waitForDeployment();

    await strategy.transferOwnership(await vault.getAddress());

    await mockToken.mint(user1.address, ethers.parseUnits("10000", 6));
    await mockToken.mint(user2.address, ethers.parseUnits("10000", 6));
  });

  describe("Deployment", function () {
    it("Should set the correct parameters", async function () {
      expect(await vault.asset()).to.equal(await mockToken.getAddress());
      expect(await vault.strategy()).to.equal(await strategy.getAddress());
      expect(await vault.donationRouter()).to.equal(await router.getAddress());
      expect(await vault.beneficiary()).to.equal(beneficiary.address);
      expect(await vault.owner()).to.equal(owner.address);
      expect(await vault.paused()).to.equal(false);
      expect(await vault.totalDonated()).to.equal(0);
    });

    it("Should revert with zero strategy address", async function () {
      const VaultFactory = await ethers.getContractFactory("Yield4GoodVault");
      await expect(
        VaultFactory.deploy(
          await mockToken.getAddress(),
          ethers.ZeroAddress,
          await router.getAddress(),
          beneficiary.address,
          "Yield4Good Vault",
          "Y4G"
        )
      ).to.be.revertedWith("Yield4GoodVault: zero strategy address");
    });

    it("Should revert with zero router address", async function () {
      const VaultFactory = await ethers.getContractFactory("Yield4GoodVault");
      await expect(
        VaultFactory.deploy(
          await mockToken.getAddress(),
          await strategy.getAddress(),
          ethers.ZeroAddress,
          beneficiary.address,
          "Yield4Good Vault",
          "Y4G"
        )
      ).to.be.revertedWith("Yield4GoodVault: zero router address");
    });

    it("Should revert with zero beneficiary address", async function () {
      const VaultFactory = await ethers.getContractFactory("Yield4GoodVault");
      await expect(
        VaultFactory.deploy(
          await mockToken.getAddress(),
          await strategy.getAddress(),
          await router.getAddress(),
          ethers.ZeroAddress,
          "Yield4Good Vault",
          "Y4G"
        )
      ).to.be.revertedWith("Yield4GoodVault: zero beneficiary address");
    });
  });

  describe("Deposit", function () {
    it("Should allow user to deposit", async function () {
      const amount = ethers.parseUnits("1000", 6);
      
      await mockToken.connect(user1).approve(await vault.getAddress(), amount);
      await vault.connect(user1).deposit(amount, user1.address);

      expect(await vault.balanceOf(user1.address)).to.be.gt(0);
      expect(await strategy.principal()).to.equal(amount);
    });

    it("Should mint correct shares", async function () {
      const amount = ethers.parseUnits("1000", 6);
      
      await mockToken.connect(user1).approve(await vault.getAddress(), amount);
      const shares = await vault.connect(user1).deposit.staticCall(amount, user1.address);
      await vault.connect(user1).deposit(amount, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(shares);
    });

    it("Should revert when paused", async function () {
      await vault.setPaused(true);
      
      const amount = ethers.parseUnits("1000", 6);
      await mockToken.connect(user1).approve(await vault.getAddress(), amount);
      
      await expect(
        vault.connect(user1).deposit(amount, user1.address)
      ).to.be.revertedWith("Yield4GoodVault: paused");
    });

    it("Should handle multiple deposits", async function () {
      const amount1 = ethers.parseUnits("1000", 6);
      const amount2 = ethers.parseUnits("500", 6);
      
      await mockToken.connect(user1).approve(await vault.getAddress(), amount1);
      await vault.connect(user1).deposit(amount1, user1.address);

      await mockToken.connect(user1).approve(await vault.getAddress(), amount2);
      await vault.connect(user1).deposit(amount2, user1.address);

      expect(await strategy.principal()).to.equal(amount1 + amount2);
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockToken.connect(user1).approve(await vault.getAddress(), amount);
      await vault.connect(user1).deposit(amount, user1.address);
    });

    it("Should allow user to withdraw", async function () {
      const shares = await vault.balanceOf(user1.address);
      const assets = await vault.convertToAssets(shares);
      
      const balanceBefore = await mockToken.balanceOf(user1.address);
      await vault.connect(user1).redeem(shares, user1.address, user1.address);
      const balanceAfter = await mockToken.balanceOf(user1.address);

      expect(balanceAfter - balanceBefore).to.be.closeTo(assets, ethers.parseUnits("1", 6));
      expect(await vault.balanceOf(user1.address)).to.equal(0);
    });

    it("Should work when paused", async function () {
      await vault.setPaused(true);
      
      const shares = await vault.balanceOf(user1.address);
      await expect(vault.connect(user1).redeem(shares, user1.address, user1.address))
        .to.not.be.reverted;
    });

    it("Should divest from strategy if needed", async function () {
      const shares = await vault.balanceOf(user1.address);
      
      const principalBefore = await strategy.principal();
      await vault.connect(user1).redeem(shares, user1.address, user1.address);
      
      expect(await strategy.principal()).to.be.lt(principalBefore);
    });
  });

  describe("Harvest", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockToken.connect(user1).approve(await vault.getAddress(), amount);
      await vault.connect(user1).deposit(amount, user1.address);
    });

    it("Should harvest yield and donate to beneficiary", async function () {
      const yieldAmount = ethers.parseUnits("50", 6);
      
      await mockToken.mint(await strategy.getAddress(), yieldAmount);
      await strategy.setSimulatedYield(yieldAmount);

      const beneficiaryBalanceBefore = await mockToken.balanceOf(beneficiary.address);
      
      await expect(vault.harvest())
        .to.emit(vault, "Harvest")
        .withArgs(yieldAmount, beneficiary.address)
        .and.to.emit(router, "YieldDonated")
        .withArgs(
          await mockToken.getAddress(),
          beneficiary.address,
          yieldAmount,
          await vault.getAddress()
        );

      expect(await mockToken.balanceOf(beneficiary.address)).to.equal(
        beneficiaryBalanceBefore + yieldAmount
      );
      expect(await vault.totalDonated()).to.equal(yieldAmount);
    });

    it("Should not affect user principal", async function () {
      const yieldAmount = ethers.parseUnits("50", 6);
      
      await mockToken.mint(await strategy.getAddress(), yieldAmount);
      await strategy.setSimulatedYield(yieldAmount);

      const sharesBefore = await vault.balanceOf(user1.address);
      const assetsBefore = await vault.convertToAssets(sharesBefore);
      
      await vault.harvest();

      const sharesAfter = await vault.balanceOf(user1.address);
      const assetsAfter = await vault.convertToAssets(sharesAfter);

      expect(sharesAfter).to.equal(sharesBefore);
      expect(assetsAfter).to.be.closeTo(assetsBefore, ethers.parseUnits("50", 6));
    });

    it("Should handle zero yield", async function () {
      await expect(vault.harvest()).to.not.be.reverted;
      expect(await vault.totalDonated()).to.equal(0);
    });

    it("Should revert when paused", async function () {
      await vault.setPaused(true);
      await expect(vault.harvest()).to.be.revertedWith("Yield4GoodVault: paused");
    });

    it("Should accumulate total donated", async function () {
      const yieldAmount1 = ethers.parseUnits("50", 6);
      const yieldAmount2 = ethers.parseUnits("30", 6);
      
      await mockToken.mint(await strategy.getAddress(), yieldAmount1);
      await strategy.setSimulatedYield(yieldAmount1);
      await vault.harvest();

      await mockToken.mint(await strategy.getAddress(), yieldAmount2);
      await strategy.setSimulatedYield(yieldAmount2);
      await vault.harvest();

      expect(await vault.totalDonated()).to.equal(yieldAmount1 + yieldAmount2);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set beneficiary", async function () {
      const newBeneficiary = user2.address;
      
      await expect(vault.setBeneficiary(newBeneficiary))
        .to.emit(vault, "BeneficiaryChanged")
        .withArgs(newBeneficiary);

      expect(await vault.beneficiary()).to.equal(newBeneficiary);
    });

    it("Should revert setting zero beneficiary", async function () {
      await expect(vault.setBeneficiary(ethers.ZeroAddress))
        .to.be.revertedWith("Yield4GoodVault: zero beneficiary address");
    });

    it("Should allow owner to set donation router", async function () {
      const newRouter = user2.address;
      
      await expect(vault.setDonationRouter(newRouter))
        .to.emit(vault, "DonationRouterChanged")
        .withArgs(newRouter);

      expect(await vault.donationRouter()).to.equal(newRouter);
    });

    it("Should allow owner to pause/unpause", async function () {
      await expect(vault.setPaused(true))
        .to.emit(vault, "Paused")
        .withArgs(true);
      expect(await vault.paused()).to.equal(true);

      await expect(vault.setPaused(false))
        .to.emit(vault, "Paused")
        .withArgs(false);
      expect(await vault.paused()).to.equal(false);
    });

    it("Should allow owner to emergency divest", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockToken.connect(user1).approve(await vault.getAddress(), amount);
      await vault.connect(user1).deposit(amount, user1.address);

      const divestAmount = ethers.parseUnits("500", 6);
      
      await expect(vault.emergencyDivest(divestAmount))
        .to.emit(vault, "EmergencyDivest")
        .withArgs(divestAmount);

      expect(await strategy.principal()).to.equal(amount - divestAmount);
    });

    it("Should revert admin functions for non-owner", async function () {
      await expect(vault.connect(user1).setBeneficiary(user2.address))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

      await expect(vault.connect(user1).setPaused(true))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

      await expect(vault.connect(user1).emergencyDivest(ethers.parseUnits("100", 6)))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  describe("Multi-user scenarios", function () {
    it("Should handle deposits from multiple users", async function () {
      const amount1 = ethers.parseUnits("1000", 6);
      const amount2 = ethers.parseUnits("2000", 6);
      
      await mockToken.connect(user1).approve(await vault.getAddress(), amount1);
      await vault.connect(user1).deposit(amount1, user1.address);

      await mockToken.connect(user2).approve(await vault.getAddress(), amount2);
      await vault.connect(user2).deposit(amount2, user2.address);

      expect(await vault.totalAssets()).to.be.closeTo(
        amount1 + amount2,
        ethers.parseUnits("1", 6)
      );
    });

    it("Should distribute yield proportionally (implicit)", async function () {
      const amount1 = ethers.parseUnits("1000", 6);
      const amount2 = ethers.parseUnits("2000", 6);
      
      await mockToken.connect(user1).approve(await vault.getAddress(), amount1);
      await vault.connect(user1).deposit(amount1, user1.address);

      await mockToken.connect(user2).approve(await vault.getAddress(), amount2);
      await vault.connect(user2).deposit(amount2, user2.address);

      const yieldAmount = ethers.parseUnits("150", 6);
      await mockToken.mint(await strategy.getAddress(), yieldAmount);
      await strategy.setSimulatedYield(yieldAmount);
      await vault.harvest();

      const shares1 = await vault.balanceOf(user1.address);
      const shares2 = await vault.balanceOf(user2.address);
      const assets1 = await vault.convertToAssets(shares1);
      const assets2 = await vault.convertToAssets(shares2);

      expect(assets1).to.be.closeTo(amount1, ethers.parseUnits("2", 6));
      expect(assets2).to.be.closeTo(amount2, ethers.parseUnits("2", 6));
    });
  });

  describe("TotalAssets", function () {
    it("Should return correct total assets", async function () {
      const amount = ethers.parseUnits("1000", 6);
      
      await mockToken.connect(user1).approve(await vault.getAddress(), amount);
      await vault.connect(user1).deposit(amount, user1.address);

      expect(await vault.totalAssets()).to.be.closeTo(amount, ethers.parseUnits("1", 6));
    });

    it("Should include strategy assets", async function () {
      const amount = ethers.parseUnits("1000", 6);
      
      await mockToken.connect(user1).approve(await vault.getAddress(), amount);
      await vault.connect(user1).deposit(amount, user1.address);

      const yieldAmount = ethers.parseUnits("50", 6);
      await strategy.setSimulatedYield(yieldAmount);

      expect(await vault.totalAssets()).to.be.closeTo(
        amount + yieldAmount,
        ethers.parseUnits("1", 6)
      );
    });
  });
});
