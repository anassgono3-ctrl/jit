import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockVault flashLoan flow with JIT skeleton", function () {
  it("receives flashloan, executes JIT skeleton, emits events, and repays", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const token = await ERC20Mock.deploy("Token", "TKN");
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    // Fund vault so it can loan principal
    const initialVault = ethers.parseEther("1000");
    await token.mint(vaultAddr, initialVault);

    // Receiver
    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const receiver = await Receiver.deploy();
    await receiver.waitForDeployment();
    const receiverAddr = await receiver.getAddress();

    // Loan params
    const amount = ethers.parseEther("10");
    const tokens = [tokenAddr];
    const amounts = [amount];

    // FeeBps defaults to 5 (0.05%) in MockVault
    const feeBps = 5n;
    const expectedFee = (amount * feeBps) / 10000n;

    // Pre-fund receiver with a small buffer for fee (principal is sent by vault)
    await token.mint(receiverAddr, expectedFee);

    const before = await token.balanceOf(vaultAddr);

    // Execute
    const tx = await vault.flashLoan(receiverAddr, tokens, amounts, "0x");
    const receipt = await tx.wait();

    const after = await token.balanceOf(vaultAddr);
    expect(after).to.equal(before + expectedFee);

    // Parse receiver events with ethers v6
    const iface = Receiver.interface;
    const logsForReceiver = (receipt!.logs as any[]).filter(
      (l) => (l.address || "").toLowerCase() === receiverAddr.toLowerCase()
    );
    const parsed = logsForReceiver
      .map((log) => {
        try {
          return iface.parseLog({ topics: log.topics, data: log.data });
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any[];

    const names = parsed.map((e: any) => e.name);
    expect(names).to.include("FlashLoanReceived");
    expect(names).to.include("StrategyStarted");
    expect(names.some((n: string) => n === "StrategySucceeded" || n === "StrategyFailed")).to.equal(true);
    expect(names).to.include("FlashLoanRepaid");
  });

  it("fails if receiver does not repay (BadReceiver)", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const token = await ERC20Mock.deploy("Token", "TKN");
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    await token.mint(vaultAddr, ethers.parseEther("1000"));

    const BadReceiver = await ethers.getContractFactory("BadReceiver");
    const bad = await BadReceiver.deploy();
    await bad.waitForDeployment();
    const badAddr = await bad.getAddress();

    const tokens = [tokenAddr];
    const amounts = [ethers.parseEther("10")];

    await expect(vault.flashLoan(badAddr, tokens, amounts, "0x")).to.be.revertedWith("not repaid");
  });

  it("handles multi-token flashloan (principal+fee for each token)", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const tokenA = await ERC20Mock.deploy("TokenA", "A");
    const tokenB = await ERC20Mock.deploy("TokenB", "B");
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();
    const addrA = await tokenA.getAddress();
    const addrB = await tokenB.getAddress();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    const initialA = ethers.parseEther("1000");
    const initialB = ethers.parseEther("500");
    await tokenA.mint(vaultAddr, initialA);
    await tokenB.mint(vaultAddr, initialB);

    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const receiver = await Receiver.deploy();
    await receiver.waitForDeployment();
    const receiverAddr = await receiver.getAddress();

    const amtA = ethers.parseEther("10");
    const amtB = ethers.parseEther("5");
    const feeBps = 5n;
    const feeA = (amtA * feeBps) / 10000n;
    const feeB = (amtB * feeBps) / 10000n;

    // Pre-fund receiver for both fees
    await tokenA.mint(receiverAddr, feeA);
    await tokenB.mint(receiverAddr, feeB);

    const tokens = [addrA, addrB];
    const amounts = [amtA, amtB];

    await vault.flashLoan(receiverAddr, tokens, amounts, "0x");

    const balA = await tokenA.balanceOf(vaultAddr);
    const balB = await tokenB.balanceOf(vaultAddr);

    // Exact expected balances — initial + fee
    expect(balA).to.equal(initialA + feeA);
    expect(balB).to.equal(initialB + feeB);
  });

  it("respects custom feeBps", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const token = await ERC20Mock.deploy("Token", "TKN");
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    const initial = ethers.parseEther("1000");
    await token.mint(vaultAddr, initial);

    // Set custom fee to 1% (100 bps)
    await vault.setFeeBps(100);

    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const receiver = await Receiver.deploy();
    await receiver.waitForDeployment();
    const receiverAddr = await receiver.getAddress();

    const amount = ethers.parseEther("10");
    const expectedFee = (amount * 100n) / 10000n;

    // Pre-fund receiver with fee so it can repay principal+fee
    await token.mint(receiverAddr, expectedFee);

    const tokens = [tokenAddr];
    const amounts = [amount];

    await vault.flashLoan(receiverAddr, tokens, amounts, "0x");

    const after = await token.balanceOf(vaultAddr);
    expect(after).to.equal(initial + expectedFee);
  });
});
