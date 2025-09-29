import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockVault flashLoan flow with JIT skeleton", function () {
  it("receives flashloan, executes JIT skeleton, emits events, and repays", async function () {
    const [deployer] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const token = await ERC20Mock.deploy("Token", "TKN");
    await token.waitForDeployment();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();

    // Mint tokens to vault so it can transfer out then check repayment
    const vaultAddr = await vault.getAddress(); // or vault.target
    await token.mint(vaultAddr, ethers.parseEther("1000"));

    // Deploy the receiver
    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const receiver = await Receiver.deploy();
    await receiver.waitForDeployment();
    const receiverAddr = await receiver.getAddress(); // or receiver.target

    const tokens = [await token.getAddress()]; // or token.target
    const amounts = [ethers.parseEther("10")];

    const vaultBalanceBefore = await token.balanceOf(vaultAddr);

    // Execute flashloan
    const tx = await vault.flashLoan(receiverAddr, tokens, amounts, "0x");
    const receipt = await tx.wait();

    // Verify repayment occurred (at least principal; in mock it's principal+fee)
    const vaultBalanceAfter = await token.balanceOf(vaultAddr);
    expect(vaultBalanceAfter).to.be.at.least(vaultBalanceBefore);

    // Verify events from the receiver: filter logs by receiver address and parse
    const iface = Receiver.interface;
    const logsForReceiver = receipt!.logs.filter((l: any) => (l.address || "").toLowerCase() === receiverAddr.toLowerCase());
    const parsed = logsForReceiver
      .map((log: any) => {
        try {
          // ethers v6 Interface.parseLog needs { topics, data }
          return iface.parseLog({ topics: log.topics, data: log.data });
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any[];

    const names = parsed.map((e: any) => e.name);
    expect(names).to.include("FlashLoanReceived");
    expect(names).to.include("StrategyStarted");
    expect(names).to.include("FlashLoanRepaid");
    expect(names.some((n: string) => n === "StrategySucceeded" || n === "StrategyFailed")).to.equal(true);
  });
});
