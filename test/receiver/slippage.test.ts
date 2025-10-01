import { expect } from "chai";
import { ethers } from "hardhat";

describe("Receiver slippage + quoter", function () {
  it("calcAmountOutMin at 50 bps yields 0.995x", async function () {
    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const r = await Receiver.deploy();
    await r.waitForDeployment();

    // default slippageBps=50
    const quote = ethers.parseEther("1000");
    const min = await r.calcAmountOutMin(quote);
    expect(min).to.equal((quote * 9950n) / 10000n);
  });

  it("uses quoter to set amountOutMinimum; swap succeeds if router returns >= minOut", async function () {
    // Deploy mocks
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const tokenIn = await ERC20Mock.deploy("TokenIn", "TIN");
    const tokenOut = await ERC20Mock.deploy("TokenOut", "TOUT");
    await tokenIn.waitForDeployment();
    await tokenOut.waitForDeployment();
    const addrIn = await tokenIn.getAddress();
    const addrOut = await tokenOut.getAddress();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    const Router = await ethers.getContractFactory("MockRouterV3");
    const router = await Router.deploy();
    await router.waitForDeployment();
    const routerAddr = await router.getAddress();

    const Quoter = await ethers.getContractFactory("MockQuoter");
    const quoter = await Quoter.deploy();
    await quoter.waitForDeployment();
    const quoterAddr = await quoter.getAddress();

    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const r = await Receiver.deploy();
    await r.waitForDeployment();
    const receiverAddr = await r.getAddress();

    // Configure receiver
    await r.setSwapRouter(routerAddr);
    await r.setQuoter(quoterAddr);
    await r.setDefaultPoolFee(3000); // default

    // Vault has liquidity to lend tokenIn principal
    const loanAmount = ethers.parseEther("10");
    await tokenIn.mint(vaultAddr, ethers.parseEther("1000"));

    // Router has tokenOut to send to receiver
    await tokenOut.mint(routerAddr, ethers.parseEther("1000"));

    // Quoter returns 100 for amountIn=5; with 50 bps slippage => minOut ~ 99.5; router will return 100
    await quoter.setQuote(ethers.parseEther("100"));
    await router.setAmountOut(ethers.parseEther("100"));

    // Compute fee and pre-fund receiver with amountIn + fee to ensure repay after swapping half away
    const feeBps: bigint = BigInt(await vault.feeBps());
    const expectedFee = (loanAmount * feeBps) / 10000n;
    const amountInHalf = loanAmount / 2n;
    const buffer = amountInHalf + expectedFee;

    await tokenIn.mint(receiverAddr, buffer);

    const beforeVaultIn = await tokenIn.balanceOf(vaultAddr);

    // Flashloan: tokens[0]=tokenIn, tokens[1]=tokenOut (amount 0 for out)
    const tx = await vault.flashLoan(receiverAddr, [addrIn, addrOut], [loanAmount, 0n], "0x");
    const receipt = await tx.wait();

    // Router pulled amountInHalf of tokenIn and sent 100 tokenOut to receiver
    const receiverOut = await tokenOut.balanceOf(receiverAddr);
    expect(receiverOut).to.equal(ethers.parseEther("100"));

    // Vault should end with principal + fee for tokenIn => net +fee vs before
    const afterVaultIn = await tokenIn.balanceOf(vaultAddr);
    expect(afterVaultIn).to.equal(beforeVaultIn + expectedFee);

    // Verify SwapExecuted event was emitted
    const iface = r.interface;
    const logsForReceiver = (receipt!.logs as any[]).filter(
      (l) => (l.address || "").toLowerCase() === receiverAddr.toLowerCase()
    );
    const names = logsForReceiver
      .map((log) => {
        try {
          return iface.parseLog({ topics: log.topics, data: log.data })?.name;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    expect(names).to.include("SwapExecuted");
  });

  it("does not revert entire flashLoan when router would return below minOut (swap caught); no SwapExecuted emitted", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const tokenIn = await ERC20Mock.deploy("A", "A");
    const tokenOut = await ERC20Mock.deploy("B", "B");
    await tokenIn.waitForDeployment();
    await tokenOut.waitForDeployment();
    const addrIn = await tokenIn.getAddress();
    const addrOut = await tokenOut.getAddress();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    const Router = await ethers.getContractFactory("MockRouterV3");
    const router = await Router.deploy();
    await router.waitForDeployment();
    const routerAddr = await router.getAddress();

    const Quoter = await ethers.getContractFactory("MockQuoter");
    const quoter = await Quoter.deploy();
    await quoter.waitForDeployment();
    const quoterAddr = await quoter.getAddress();

    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const r = await Receiver.deploy();
    await r.waitForDeployment();
    const receiverAddr = await r.getAddress();

    await r.setSwapRouter(routerAddr);
    await r.setQuoter(quoterAddr);
    await r.setDefaultPoolFee(3000);

    const loanAmount = ethers.parseEther("10");
    await tokenIn.mint(vaultAddr, ethers.parseEther("1000"));
    await tokenOut.mint(routerAddr, ethers.parseEther("1000"));

    // Quoter => 100; with 50bps minOut ~ 99.5; router only provides 99 -> swap would fail, but receiver catches and continues
    await quoter.setQuote(ethers.parseEther("100"));
    await router.setAmountOut(ethers.parseEther("99"));

    // Pre-fund receiver with half + fee to ensure repay even if swap pulls half (in this case it will revert and be caught)
    const feeBps: bigint = BigInt(await vault.feeBps());
    const expectedFee = (loanAmount * feeBps) / 10000n;
    const amountInHalf = loanAmount / 2n;
    const buffer = amountInHalf + expectedFee;
    await tokenIn.mint(receiverAddr, buffer);

    const beforeVaultIn = await tokenIn.balanceOf(vaultAddr);

    const tx = await vault.flashLoan(receiverAddr, [addrIn, addrOut], [loanAmount, 0n], "0x");
    const receipt = await tx.wait();

    // No SwapExecuted event (swap reverted and was caught)
    const iface = r.interface;
    const logsForReceiver = (receipt!.logs as any[]).filter(
      (l) => (l.address || "").toLowerCase() === receiverAddr.toLowerCase()
    );
    const names = logsForReceiver
      .map((log) => {
        try {
          return iface.parseLog({ topics: log.topics, data: log.data })?.name;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    expect(names).to.not.include("SwapExecuted");

    // Vault still ends with +fee
    const afterVaultIn = await tokenIn.balanceOf(vaultAddr);
    expect(afterVaultIn).to.equal(beforeVaultIn + expectedFee);
  });

  it("falls back to amountOutMinimum=0 when quoter is unset; swap executes and flashLoan repays", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const tokenIn = await ERC20Mock.deploy("A", "A");
    const tokenOut = await ERC20Mock.deploy("B", "B");
    await tokenIn.waitForDeployment();
    await tokenOut.waitForDeployment();
    const addrIn = await tokenIn.getAddress();
    const addrOut = await tokenOut.getAddress();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    const Router = await ethers.getContractFactory("MockRouterV3");
    const router = await Router.deploy();
    await router.waitForDeployment();
    const routerAddr = await router.getAddress();

    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const r = await Receiver.deploy();
    await r.waitForDeployment();
    const receiverAddr = await r.getAddress();

    await r.setSwapRouter(routerAddr);
    // No quoter set -> fallback minOut = 0

    const loanAmount = ethers.parseEther("10");
    await tokenIn.mint(vaultAddr, ethers.parseEther("1000"));
    await tokenOut.mint(routerAddr, ethers.parseEther("1000"));

    await router.setAmountOut(ethers.parseEther("1")); // tiny output but >= 0 is fine

    // Pre-fund receiver with half + fee so we can repay after swapping half away
    const feeBps: bigint = BigInt(await vault.feeBps());
    const expectedFee = (loanAmount * feeBps) / 10000n;
    const amountInHalf = loanAmount / 2n;
    const buffer = amountInHalf + expectedFee;
    await tokenIn.mint(receiverAddr, buffer);

    const beforeVaultIn = await tokenIn.balanceOf(vaultAddr);

    const tx = await vault.flashLoan(receiverAddr, [addrIn, addrOut], [loanAmount, 0n], "0x");
    const receipt = await tx.wait();

    // Swap executed (router sends 1)
    const receiverOut = await tokenOut.balanceOf(receiverAddr);
    expect(receiverOut).to.equal(ethers.parseEther("1"));

    const afterVaultIn = await tokenIn.balanceOf(vaultAddr);
    expect(afterVaultIn).to.equal(beforeVaultIn + expectedFee);
  });
});
