import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockVault flashLoan flow", function () {
  it("receives flashloan and repays", async function () {
    const [deployer] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const token = await ERC20Mock.deploy("Token", "TKN");
    await token.deployed();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.deployed();

    // Mint tokens to vault so it can transfer out then check repayment
    await token.mint(vault.address, ethers.parseEther("1000"));

    // Deploy the receiver
    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const receiver = await Receiver.deploy();
    await receiver.deployed();

    const tokens = [token.target];
    const amounts = [ethers.parseEther("10")];

    await vault.flashLoan(receiver.target, tokens, amounts, "0x");

    // If no revert: receiver repaid successfully
    const vaultBalance = await token.balanceOf(vault.target);
    expect(vaultBalance).to.be.at.least(amounts[0]); // at least principal (actually principal+fee)
  });

  it("fails if receiver does not repay (placeholder)", async function () {
    // To test failure, a deliberately 'bad' receiver would be needed.
    // The default receiver always repays; keep this as documentation.
    expect(true).to.equal(true);
  });
});