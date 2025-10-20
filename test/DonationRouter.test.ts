import { expect } from "chai";
import { ethers } from "hardhat";
import { DonationRouter, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("DonationRouter", function () {
  let donationRouter: DonationRouter;
  let mockToken: MockERC20;
  let owner: SignerWithAddress;
  let vault: SignerWithAddress;
  let beneficiary: SignerWithAddress;

  beforeEach(async function () {
    [owner, vault, beneficiary] = await ethers.getSigners();

    const ERC20Factory = await ethers.getContractFactory("MockERC20");
    mockToken = await ERC20Factory.deploy("Mock USDC", "USDC", 6);
    await mockToken.waitForDeployment();

    const DonationRouterFactory = await ethers.getContractFactory("DonationRouter");
    donationRouter = await DonationRouterFactory.deploy();
    await donationRouter.waitForDeployment();

    await mockToken.mint(vault.address, ethers.parseUnits("10000", 6));
  });

  describe("Donate", function () {
    it("Should transfer tokens to beneficiary and emit event", async function () {
      const amount = ethers.parseUnits("100", 6);
      
      await mockToken.connect(vault).approve(await donationRouter.getAddress(), amount);
      
      await expect(
        donationRouter.connect(vault).donate(
          await mockToken.getAddress(),
          beneficiary.address,
          amount
        )
      )
        .to.emit(donationRouter, "YieldDonated")
        .withArgs(
          await mockToken.getAddress(),
          beneficiary.address,
          amount,
          vault.address
        );

      expect(await mockToken.balanceOf(beneficiary.address)).to.equal(amount);
    });

    it("Should revert on zero asset address", async function () {
      await expect(
        donationRouter.donate(
          ethers.ZeroAddress,
          beneficiary.address,
          ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("DonationRouter: zero asset address");
    });

    it("Should revert on zero beneficiary address", async function () {
      await expect(
        donationRouter.donate(
          await mockToken.getAddress(),
          ethers.ZeroAddress,
          ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("DonationRouter: zero beneficiary address");
    });

    it("Should revert on zero amount", async function () {
      await expect(
        donationRouter.donate(
          await mockToken.getAddress(),
          beneficiary.address,
          0
        )
      ).to.be.revertedWith("DonationRouter: zero amount");
    });

    it("Should handle multiple donations", async function () {
      const amount1 = ethers.parseUnits("100", 6);
      const amount2 = ethers.parseUnits("50", 6);
      
      await mockToken.connect(vault).approve(await donationRouter.getAddress(), amount1 + amount2);
      
      await donationRouter.connect(vault).donate(
        await mockToken.getAddress(),
        beneficiary.address,
        amount1
      );

      await donationRouter.connect(vault).donate(
        await mockToken.getAddress(),
        beneficiary.address,
        amount2
      );

      expect(await mockToken.balanceOf(beneficiary.address)).to.equal(amount1 + amount2);
    });
  });
});
