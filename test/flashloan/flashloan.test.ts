import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockVault flashLoan flow with JIT skeleton", function () {
  it("receives flashloan, executes JIT skeleton, emits events, and repays", async function () {
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

    const vaultBalanceBefore = await token.balanceOf(vault.target);

    // Execute flashloan
    const tx = await vault.flashLoan(receiver.target, tokens, amounts, "0x");
    const receipt = await tx.wait();

    // Verify repayment occurred
    const vaultBalanceAfter = await token.balanceOf(vault.target);
    expect(vaultBalanceAfter).to.be.at.least(vaultBalanceBefore);

    // Verify events: FlashLoanReceived, StrategyStarted, FlashLoanRepaid (and possibly StrategySucceeded/Failed)
    const iface = Receiver.interface;
    const parsed = receipt!.logs
      .map((log) => {
        try {
          return iface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any[];

    const names = parsed.map((e) => e.name);
    expect(names).to.include("FlashLoanReceived");
    expect(names).to.include("StrategyStarted");
    expect(names).to.include("FlashLoanRepaid");
    // At least one of succeed/failed should be present (skeleton emits Succeeded by default)
    expect(names.some((n) => n === "StrategySucceeded" || n === "StrategyFailed")).to.equal(true);
  });
});