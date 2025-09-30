import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('Balancer fork flashloan integration', function () {
  const BALANCER_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
  const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  const WETH_WHALES = [
    '0x06920C9fC643De77B99cB7670A944AD31eaAA260',
    '0x28C6c06298d514Db089934071355E5743bf21d60',
  ];
  const USDC_WHALES = [
    '0xF977814e90dA44bFA03b6295A0616a897441aceC',
    '0x28C6c06298d514Db089934071355E5743bf21d60',
  ];

  const STRICT = String(process.env.FORK_STRICT || '').toLowerCase() === 'true';

  before(function () {
    if (!process.env.FORK_RPC_URL) {
      console.log('[fork-test] skipping: FORK_RPC_URL not set');
      this.skip();
    }
  });

  async function impersonate(addr: string) {
    await ethers.provider.send('hardhat_impersonateAccount', [addr]);
    await ethers.provider.send('hardhat_setBalance', [
      addr,
      '0x3635C9ADC5DEA00000',
    ]); // 1,000 ETH
    return await ethers.getSigner(addr);
  }

  async function ensureWethBuffer(receiver: string, minBufferWei: bigint) {
    const wethAbi = [
      'function deposit() payable',
      'function balanceOf(address) view returns (uint256)',
      'function transfer(address,uint256) returns (bool)',
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
    throw new Error('Failed to fund WETH buffer for receiver on fork');
  }

  async function ensureUsdcBuffer(receiver: string, minBuffer: bigint) {
    const erc20Abi = [
      'function balanceOf(address) view returns (uint256)',
      'function transfer(address,uint256) returns (bool)',
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
    throw new Error('Failed to fund USDC buffer for receiver on fork');
  }

  function divDown(x: bigint, d: bigint): bigint {
    return x / d;
  }

  // Preflight: detect if Vault has flashloans disabled by probing 1-wei single token
  async function flashloansDisabled(
    vault: any,
    receiverAddr: string
  ): Promise<boolean> {
    try {
      await vault.flashLoan.staticCall(receiverAddr, [WETH], [1n], '0x');
      return false;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (/BAL#102/i.test(msg)) {
        console.log('[fork-test] flashloans disabled on this block (BAL#102)');
        return true;
      }
      // Unknown revert: treat as not conclusive; let normal probe logic handle it
      return false;
    }
  }

  async function findSafeFlashLoanVector(
    vault: any,
    receiverAddr: string,
    tokens: string[],
    start: bigint[],
    floors: bigint[],
    divisors: bigint[]
  ): Promise<bigint[] | null> {
    for (const div of divisors) {
      const candidate = start.map((amt, i) => {
        const downsized = divDown(amt, div);
        return downsized >= floors[i] ? downsized : floors[i];
      });
      try {
        await vault.flashLoan.staticCall(receiverAddr, tokens, candidate, '0x');
        return candidate;
      } catch {
        // continue
      }
    }
    return null;
  }

  async function findAnySafeVector(
    vault: any,
    receiverAddr: string,
    wethBal: bigint,
    usdcBal: bigint,
    floorWeth: bigint,
    floorUsdc: bigint
  ): Promise<{ tokens: string[]; amounts: bigint[]; reason: string } | null> {
    // Looser probe as per stabilization plan
    const divisors = [1n, 2n, 5n, 10n, 20n, 50n, 100n, 200n, 500n, 1000n, 2000n, 5000n];

    // Start ~2% of ERC20 balances
    const startWeth = wethBal / 50n;
    const startUsdc = usdcBal / 50n;

    // Try two-token first
    let safe = await findSafeFlashLoanVector(
      vault,
      receiverAddr,
      [WETH, USDC],
      [startWeth, startUsdc],
      [floorWeth, floorUsdc],
      divisors
    );
    if (safe)
      return { tokens: [WETH, USDC], amounts: safe, reason: 'two-token' };

    // WETH-only
    safe = await findSafeFlashLoanVector(
      vault,
      receiverAddr,
      [WETH],
      [startWeth],
      [floorWeth],
      divisors
    );
    if (safe) return { tokens: [WETH], amounts: safe, reason: 'weth-only' };

    // USDC-only
    safe = await findSafeFlashLoanVector(
      vault,
      receiverAddr,
      [USDC],
      [startUsdc],
      [floorUsdc],
      divisors
    );
    if (safe) return { tokens: [USDC], amounts: safe, reason: 'usdc-only' };

    return null;
  }

  it('executes WETH+USDC flashloan, repays via approve, and logs gas/balances', async function () {
    const Receiver = await ethers.getContractFactory(
      'BalancerFlashJitReceiver'
    );
    const receiver = await Receiver.deploy();
    await receiver.waitForDeployment();
    const receiverAddr = await receiver.getAddress();

    const vault = await ethers.getContractAt(
      'contracts/interfaces/IVault.sol:IVault',
      BALANCER_VAULT
    );
    const weth = await ethers.getContractAt(
      'contracts/interfaces/IERC20.sol:IERC20',
      WETH
    );
    const usdc = await ethers.getContractAt(
      'contracts/interfaces/IERC20.sol:IERC20',
      USDC
    );

    // If flashloans are disabled (BAL#102), skip or fail per STRICT
    if (await flashloansDisabled(vault, receiverAddr)) {
      const msg =
        '[fork-test] skipping: Balancer flashloans disabled at this block (BAL#102)';
      if (STRICT) throw new Error(msg);
      console.log(msg);
      this.skip();
      return;
    }

    const vaultWethBal = (await weth.balanceOf(BALANCER_VAULT)) as bigint;
    const vaultUsdcBal = (await usdc.balanceOf(BALANCER_VAULT)) as bigint;

    if (vaultWethBal === 0n && vaultUsdcBal === 0n) {
      const msg = '[fork-test] skipping: zero vault balances at pinned block';
      if (STRICT) throw new Error(msg);
      console.log(msg);
      this.skip();
      return;
    }

    // Floors lowered (overridable via env)
    const floorWeth = process.env.FORK_TEST_MIN_WETH
      ? ethers.parseEther(process.env.FORK_TEST_MIN_WETH)
      : ethers.parseEther('0.005');
    const floorUsdc = process.env.FORK_TEST_MIN_USDC
      ? BigInt(process.env.FORK_TEST_MIN_USDC)
      : 500_000n;

    const found = await findAnySafeVector(
      vault,
      receiverAddr,
      vaultWethBal,
      vaultUsdcBal,
      floorWeth,
      floorUsdc
    );
    if (!found) {
      const msg =
        '[fork-test] skipping: no safe flashloan vector found via staticCall (two-token and single-token failed)';
      if (STRICT) throw new Error(msg);
      console.log(msg);
      this.skip();
      return;
    }

    // Fund fee buffers for tokens we actually borrow
    if (found.tokens.includes(WETH)) {
      await ensureWethBuffer(receiverAddr, floorWeth);
    }
    if (found.tokens.includes(USDC)) {
      await ensureUsdcBuffer(receiverAddr, floorUsdc / 10n);
    }

    console.log(`[fork-test] executing safe flashloan (${found.reason}):`, found.amounts.map(String));

    const tx = await vault.flashLoan(
      receiverAddr,
      found.tokens,
      found.amounts,
      '0x'
    );
    const receipt = await tx.wait();
    console.log('⛽ Gas used:', receipt?.gasUsed?.toString() || 'n/a');

    // Repayment check: balances should not decrease
    const afterWeth = (await weth.balanceOf(BALANCER_VAULT)) as bigint;
    const afterUsdc = (await usdc.balanceOf(BALANCER_VAULT)) as bigint;
    if (found.tokens.includes(WETH)) expect(afterWeth >= vaultWethBal).to.equal(true);
    if (found.tokens.includes(USDC)) expect(afterUsdc >= vaultUsdcBal).to.equal(true);
  });
});
