import { ethers } from "hardhat";
import { expect } from "chai";

describe("Balancer fork flashloan integration", function () {
  // Real mainnet contracts
  const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  // Rich holders (commonly used in fork tests)
  const WETH_WHALE = "0x06920C9fC643De77B99cB7670A944AD31eaAA260";
  const USDC_WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC"; // Binance 8

  before(function () {
    if (!process.env.FORK_RPC_URL) {
      // Guard so CI without FORK_RPC_URL won't run this suite
      this.skip();
    }
  });

  async function impersonate(addr: string) {
    await ethers.provider.send("hardhat_impersonateAccount", [addr]);
    // Top up gas for the impersonated account
    await ethers.provider.send("hardhat_setBalance", [addr, "0x56BC75E2D63100000"]); // ~100 ETH
    return await ethers.getSigner(addr);
  }

  it("executes WETH+USDC flashloan, repays via approve, and logs gas/balances", async () => {
    // Deploy receiver
    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const receiver = await Receiver.deploy();
    await receiver.waitForDeployment();
    const receiverAddr = await receiver.getAddress();

    // Vault + tokens
    const vault = await ethers.getContractAt("IVault", BALANCER_VAULT);
    const weth = await ethers.getContractAt("IERC20", WETH);
    const usdc = await ethers.getContractAt("IERC20", USDC);

    // Loan parameters
    const amountWeth = ethers.parseEther("5"); // 5 WETH
    const amountUsdc = 10_000_000n; // 10 USDC (6 decimals)
    const tokens = [WETH, USDC];
    const amounts = [amountWeth, amountUsdc];

    // Fund receiver with small fee buffers (impersonate whales)
    const wethWhale = await impersonate(WETH_WHALE);
    const usdcWhale = await impersonate(USDC_WHALE);
    // Send 0.01 WETH and 100 USDC to receiver for fee coverage
    await weth.connect(wethWhale).transfer(receiverAddr, ethers.parseEther("0.01"));
    await usdc.connect(usdcWhale).transfer(receiverAddr, 100_000_000n);

    // Vault pre-balances
    const balBeforeWeth = await weth.balanceOf(BALANCER_VAULT);
    const balBeforeUsdc = await usdc.balanceOf(BALANCER_VAULT);

    // Execute flashloan
    const tx = await vault.flashLoan(receiverAddr, tokens, amounts, "0x");
    const receipt = await tx.wait();

    console.log("⛽ Gas used:", receipt?.gasUsed?.toString() || "n/a");

    // Vault post-balances
    const balAfterWeth = await weth.balanceOf(BALANCER_VAULT);
    const balAfterUsdc = await usdc.balanceOf(BALANCER_VAULT);

    console.log("📊 WETH vault balance before/after:", balBeforeWeth.toString(), balAfterWeth.toString());
    console.log("📊 USDC vault balance before/after:", balBeforeUsdc.toString(), balAfterUsdc.toString());

    // Repayment expectations: balances should not decrease (should include fee)
    expect(balAfterWeth >= balBeforeWeth).to.equal(true);
    expect(balAfterUsdc >= balBeforeUsdc).to.equal(true);
  });
});