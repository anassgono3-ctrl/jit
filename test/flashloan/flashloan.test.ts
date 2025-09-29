import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockVault flashLoan flow with JIT skeleton", function () {
  it("receives flashloan, executes JIT skeleton, emits events, and repays", async function () {
    const [deployer] = await ethers.getSigners();

    // Deploy test ERC20
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const token = await ERC20Mock.deploy("Token", "TKN");
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();

    // Deploy MockVault
    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    // Mint tokens to the vault so it can loan them out
    await token.mint(vaultAddr, ethers.parseEther("1000"));

    // Deploy the receiver
    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const receiver = await Receiver.deploy();
    await receiver.waitForDeployment();
    const receiverAddr = await receiver.getAddress();

    // Fund receiver with a small buffer to cover fee on top of principal
    // (MockVault fee is default 5 bps; for 10 tokens the fee is 0.005)
    await token.mint(receiverAddr, ethers.parseEther("1")); // ample for fee buffer

    const tokens = [tokenAddr];
    const amounts = [ethers.parseEther("10")];

    const vaultBalanceBefore = await token.balanceOf(vaultAddr);

    // Execute flashloan (calls receiver.receiveFlashLoan -> strategy hook -> repay)
    const tx = await vault.flashLoan(receiverAddr, tokens, amounts, "0x");
    const receipt = await tx.wait();

    // Verify repayment occurred (vault balance increased; principal+fee returned)
    const vaultBalanceAfter = await token.balanceOf(vaultAddr);
    expect(vaultBalanceAfter).to.be.greaterThanOrEqual(vaultBalanceBefore);

    // Verify receiver lifecycle events
    const iface = Receiver.interface;
    // Filter logs by receiver address and parse using ethers v6 API
    const logsForReceiver = receipt!.logs.filter((l: any) => (l.address || "").toLowerCase() === receiverAddr.toLowerCase());
    const parsed = logsForReceiver
      .map((log: any) => {
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
    expect(names).to.include("FlashLoanRepaid");
    // One of these is emitted by the skeleton
    expect(names.some((n: string) => n === "StrategySucceeded" || n === "StrategyFailed")).to.equal(true);
  });
});
