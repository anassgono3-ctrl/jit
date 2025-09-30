import { ethers } from "hardhat";
import { expect } from "chai";

describe("Balancer fork flashloan integration", function () {
  const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  const WETH_WHALES = [
    "0x06920C9fC643De77B99cB7670A944AD31eaAA260",
    "0x28C6c06298d514Db089934071355E5743bf21d60" // backup
  ];
  const USDC_WHALES = [
    "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    "0x28C6c06298d514Db089934071355E5743bf21d60"
  ];

  before(function () {
    if (!process.env.FORK_RPC_URL) this.skip();
  });

  async function impersonate(addr: string) {
    await ethers.provider.send("hardhat_impersonateAccount", [addr]);
    await ethers.provider.send("hardhat_setBalance", [addr, "0x3635C9ADC5DEA00000"]); // 1,000 ETH
    return await ethers.getSigner(addr);
  }

  async function ensureWethBuffer(receiver: string, minBufferWei: bigint) {
    const wethAbi = [
      "function deposit() payable",
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address,uint256) returns (bool)"
    ];
    for (const whaleAddr of WETH_WHALES) {
      try {
        const whale = await impersonate(whaleAddr);
        const weth = new ethers.Contract(WETH, wethAbi, whale);
        const whaleBal: bigint = await weth.balanceOf(whaleAddr);
        if (whaleBal < minBufferWei) {
          await weth.deposit({ value: minBufferWei });
        }
        const tx = await weth.transfer(receiver, minBufferWei);
        await tx.wait();
        const got = (await weth.balanceOf(receiver)) as bigint;
        if (got >= minBufferWei) return;
      } catch {
        // try next whale
      }
    }
    throw new Error("Failed to fund WETH buffer for receiver on fork");
  }

  async function ensureUsdcBuffer(receiver: string, minBuffer: bigint) {
    const erc20Abi = [
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address,uint256) returns (bool)"
    ];
    for (const whaleAddr of USDC_WHALES) {
      try {
        const whale = await impersonate(whaleAddr);
        const usdc = new ethers.Contract(USDC, erc20Abi, whale);
        const whaleBal: bigint = await usdc.balanceOf(whaleAddr);
        if (whaleBal >= minBuffer) {
          const tx = await usdc.transfer(receiver, minBuffer);
          await tx.wait();
          const got = (await usdc.balanceOf(receiver)) as bigint;
          if (got >= minBuffer) return;
        }
      } catch {
        // try next whale
      }
    }
    throw new Error("Failed to fund USDC buffer for receiver on fork");
  }

  function scaleDown(amount: bigint, denom: bigint, pctBips: bigint): bigint {
    // amount * pctBips / 10000 (basis points), but at least denom
    const scaled = (amount * pctBips) / 10000n;
    return scaled >= denom ? scaled : denom;
  }

  it("executes WETH+USDC flashloan, repays via approve, and logs gas/balances", async function () {
    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const receiver = await Receiver.deploy();
    await receiver.waitForDeployment();
    const receiverAddr = await receiver.getAddress();

    const vault = await ethers.getContractAt("contracts/interfaces/IVault.sol:IVault", BALANCER_VAULT);
    const weth = await ethers.getContractAt("contracts/interfaces/IERC20.sol:IERC20", WETH);
    const usdc = await ethers.getContractAt("contracts/interfaces/IERC20.sol:IERC20", USDC);

    // Query live vault balances at the forked block
    const balBeforeWeth = (await weth.balanceOf(BALANCER_VAULT)) as bigint;
    const balBeforeUsdc = (await usdc.balanceOf(BALANCER_VAULT)) as bigint;

    // If either balance is zero (unusual on some blocks/providers), skip rather than fail
    if (balBeforeWeth === 0n || balBeforeUsdc === 0n) {
      this.skip();
      return;
    }

    // Request a small fraction of the live balances to avoid BAL#102
    // - 1% of WETH balance, floor 0.01 WETH
    // - 1% of USDC balance, floor 1 USDC (1e6)
    const minWeth = ethers.parseEther("0.01");
    const minUsdc = 1_000_000n;
    const amountWeth = scaleDown(balBeforeWeth, minWeth, 100n); // 1% in bips
    const amountUsdc = scaleDown(balBeforeUsdc, minUsdc, 100n);

    // If scaled amounts end up tiny, skip to keep run meaningful
    if (amountWeth < minWeth || amountUsdc < minUsdc) {
      this.skip();
      return;
    }

    const tokens = [WETH, USDC];
    const amounts = [amountWeth, amountUsdc];

    // Fee buffers for receiver so Vault can pull principal+fee
    await ensureWethBuffer(receiverAddr, ethers.parseEther("0.02"));
    await ensureUsdcBuffer(receiverAddr, 200_000n);

    // Execute flashloan
    const tx = await vault.flashLoan(receiverAddr, tokens, amounts, "0x");
    const receipt = await tx.wait();

    console.log("⛽ Gas used:", receipt?.gasUsed?.toString() || "n/a");

    const balAfterWeth = (await weth.balanceOf(BALANCER_VAULT)) as bigint;
    const balAfterUsdc = (await usdc.balanceOf(BALANCER_VAULT)) as bigint;

    console.log("📊 WETH vault balance before/after:", balBeforeWeth.toString(), balAfterWeth.toString());
    console.log("📊 USDC vault balance before/after:", balBeforeUsdc.toString(), balAfterUsdc.toString());

    // Repayment expectations: balances should not decrease (should include fee)
    expect(balAfterWeth >= balBeforeWeth).to.equal(true);
    expect(balAfterUsdc >= balBeforeUsdc).to.equal(true);
  });
});
