import { ethers } from "hardhat";
import { expect } from "chai";

describe("Balancer fork flashloan integration", function () {
  // Real mainnet contracts
  const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  // Common whales (lists for resilience across pinned blocks)
  const WETH_WHALES = [
    "0x06920C9fC643De77B99cB7670A944AD31eaAA260", // typical WETH whale
    "0xBecADeC0DE000000000000000000000000000000"  // placeholder backup; add real if needed
  ];
  const USDC_WHALES = [
    "0xF977814e90dA44bFA03b6295A0616a897441aceC", // Binance 8
    "0x28C6c06298d514Db089934071355E5743bf21d60"  // Binance 14
  ];

  before(function () {
    if (!process.env.FORK_RPC_URL) {
      // Skip the whole suite if fork RPC is not configured
      this.skip();
    }
  });

  async function impersonate(addr: string) {
    await ethers.provider.send("hardhat_impersonateAccount", [addr]);
    // Give plenty of ETH for gas and WETH deposit
    await ethers.provider.send("hardhat_setBalance", [addr, "0x3635C9ADC5DEA00000"]); // 1,000 ETH
    return await ethers.getSigner(addr);
  }

  async function ensureWethBuffer(receiver: string, minBufferWei: bigint) {
    // Minimal ABI for WETH actions we need
    const wethAbi = [
      "function deposit() payable",
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address,uint256) returns (bool)"
    ];
    // Try whales in order until one can fund the receiver
    for (const whaleAddr of WETH_WHALES) {
      try {
        const whale = await impersonate(whaleAddr);
        const weth = new ethers.Contract(WETH, wethAbi, whale);

        // If whale doesn't have enough WETH, mint via deposit() on fork
        const whaleBal: bigint = await weth.balanceOf(whaleAddr);
        if (whaleBal < minBufferWei) {
          await weth.deposit({ value: minBufferWei }); // mint exactly what's needed
        }
        // Transfer buffer to receiver
        const tx = await weth.transfer(receiver, minBufferWei);
        await tx.wait();
        // Verify receiver now has at least the buffer
        const got = await weth.balanceOf(receiver);
        if (got >= minBufferWei) return;
      } catch (e) {
        // try next whale
      }
    }
    throw new Error("Failed to fund WETH buffer for receiver on fork");
  }

  async function ensureUsdcBuffer(receiver: string, minBuffer: bigint) {
    // Minimal ERC20 ABI
    const erc20Abi = [
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address,uint256) returns (bool)",
      "function decimals() view returns (uint8)"
    ];
    for (const whaleAddr of USDC_WHALES) {
      try {
        const whale = await impersonate(whaleAddr);
        const usdc = new ethers.Contract(USDC, erc20Abi, whale);
        const whaleBal: bigint = await usdc.balanceOf(whaleAddr);
        if (whaleBal >= minBuffer) {
          const tx = await usdc.transfer(receiver, minBuffer);
          await tx.wait();
          const got = await usdc.balanceOf(receiver);
          if (got >= minBuffer) return;
        }
      } catch (e) {
        // try next whale
      }
    }
    throw new Error("Failed to fund USDC buffer for receiver on fork");
  }

  it("executes WETH+USDC flashloan, repays via approve, and logs gas/balances", async () => {
    // Deploy receiver
    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const receiver = await Receiver.deploy();
    await receiver.waitForDeployment();
    const receiverAddr = await receiver.getAddress();

    // Use fully qualified names to avoid HH701 ambiguities
    const vault = await ethers.getContractAt("contracts/interfaces/IVault.sol:IVault", BALANCER_VAULT);
    const weth = await ethers.getContractAt("contracts/interfaces/IERC20.sol:IERC20", WETH);
    const usdc = await ethers.getContractAt("contracts/interfaces/IERC20.sol:IERC20", USDC);

    // Loan parameters
    const amountWeth = ethers.parseEther("5");       // 5 WETH
    const amountUsdc = 10_000_000n;                  // 10 USDC (6 decimals)
    const tokens = [WETH, USDC];
    const amounts = [amountWeth, amountUsdc];

    // Fee buffers for receiver so Vault can pull principal+fee
    // These are small and safe; actual fee is taken by Vault pull after callback.
    await ensureWethBuffer(receiverAddr, ethers.parseEther("0.02")); // 0.02 WETH buffer
    await ensureUsdcBuffer(receiverAddr, 200_000n);                  // 0.2 USDC buffer

    // Vault pre-balances
    const balBeforeWeth = await weth.balanceOf(BALANCER_VAULT);
    const balBeforeUsdc = await usdc.balanceOf(BALANCER_VAULT);

    // Execute flashloan
    const tx = await vault.flashLoan(receiverAddr, tokens, amounts, "0x");
    const receipt = await tx.wait();

    console.log("⛽ Gas used:", receipt?.gasUsed?.toString() || "n/a");

    const balAfterWeth = await weth.balanceOf(BALANCER_VAULT);
    const balAfterUsdc = await usdc.balanceOf(BALANCER_VAULT);

    console.log("📊 WETH vault balance before/after:", balBeforeWeth.toString(), balAfterWeth.toString());
    console.log("📊 USDC vault balance before/after:", balBeforeUsdc.toString(), balAfterUsdc.toString());

    // Repayment expectations: balances should not decrease (should include fee)
    expect(balAfterWeth >= balBeforeWeth).to.equal(true);
    expect(balAfterUsdc >= balBeforeUsdc).to.equal(true);
  });
});
