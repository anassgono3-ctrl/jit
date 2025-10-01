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
    expect(min).to.equal(quote * 9950n / 10000n);
  });

  it("uses quoter to set amountOutMinimum; swap succeeds if router returns >= minOut", async function () {
    const [deployer] = await ethers.getSigners();

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

    const Router = await ethers.getContractFactory("MockRouterV3");
    const router = await Router.deploy();
    await router.waitForDeployment();

    const Quoter = await ethers.getContractFactory("MockQuoter");
    const quoter = await Quoter.deploy();
    await quoter.waitForDeployment();

    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const r = await Receiver.deploy();
    await r.waitForDeployment();

    // Configure receiver
    await r.setSwapRouter(await router.getAddress());
    await r.setQuoter(await quoter.getAddress());
    await r.setDefaultPoolFee(3000); // default

    // Fund vault with tokenIn to loan
    const vaultAddr = await vault.getAddress();
    const receiverAddr = await r.getAddress();

    const loanAmount = ethers.parseEther("10");
    await tokenIn.mint(vaultAddr, ethers.parseEther("1000")); // supply principal liquidity to vault
    await tokenOut.mint(await router.getAddress(), ethers.parseEther("1000")); // router has tokenOut to send

    // Quoter returns 100 tokenOut for amountIn=5 => minOut ~ 99.5 with 50 bps default
    await quoter.setQuote(ethers.parseEther("100"));
    // Router will provide 100 which is >= minOut
    await router.setAmountOut(ethers.parseEther("100"));

    // Pre-fund receiver with small buffer to cover fee pull
    await tokenIn.mint(receiverAddr, ethers.parseEther("1"));

    // Flashloan: tokens[0]=tokenIn, tokens[1]=tokenOut
    await vault.flashLoan(receiverAddr, [addrIn, addrOut], [loanAmount, 0n], "0x");

    // Verify router pulled tokenIn/2 and receiver got tokenOut
    const receiverOut = await tokenOut.balanceOf(receiverAddr);
    expect(receiverOut).to.equal(ethers.parseEther("100"));
  });

  it("reverts swap when router returns below amountOutMinimum", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const tokenIn = await ERC20Mock.deploy("A", "A");
    const tokenOut = await ERC20Mock.deploy("B", "B");
    await tokenIn.waitForDeployment();
    await tokenOut.waitForDeployment();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();

    const Router = await ethers.getContractFactory("MockRouterV3");
    const router = await Router.deploy();
    await router.waitForDeployment();

    const Quoter = await ethers.getContractFactory("MockQuoter");
    const quoter = await Quoter.deploy();
    await quoter.waitForDeployment();

    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const r = await Receiver.deploy();
    await r.waitForDeployment();

    await r.setSwapRouter(await router.getAddress());
    await r.setQuoter(await quoter.getAddress());

    const vaultAddr = await vault.getAddress();
    const receiverAddr = await r.getAddress();

    const loanAmount = ethers.parseEther("10");
    await tokenIn.mint(vaultAddr, ethers.parseEther("1000"));
    await tokenOut.mint(await router.getAddress(), ethers.parseEther("1000"));

    // Quoter returns 100; with 50bps minOut ~ 99.5; router only provides 99 -> revert
    await quoter.setQuote(ethers.parseEther("100"));
    await router.setAmountOut(ethers.parseEther("99"));

    // buffer for fee
    await tokenIn.mint(receiverAddr, ethers.parseEther("1"));

    // Expect swap revert inside callback, but flashloan overall should still complete with repayment pull attempt.
    // Our MockVault pull might then fail if balances insufficient; we only assert the swap revert is hit by observing final balances.
    try {
      await vault.flashLoan(receiverAddr, [await tokenIn.getAddress(), await tokenOut.getAddress()], [loanAmount, 0n], "0x");
    } catch (e: any) {
      // Swap revert bubbles; acceptable for this test. Ensure it mentions slippage.
      expect(String(e?.message || e)).to.match(/TooMuchSlippage/);
      return;
    }
    expect.fail("expected slippage revert but flashLoan did not revert");
  });

  it("falls back to amountOutMinimum=0 when quoter is unset or reverts", async function () {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const tokenIn = await ERC20Mock.deploy("A", "A");
    const tokenOut = await ERC20Mock.deploy("B", "B");
    await tokenIn.waitForDeployment();
    await tokenOut.waitForDeployment();

    const MockVault = await ethers.getContractFactory("MockVault");
    const vault = await MockVault.deploy();
    await vault.waitForDeployment();

    const Router = await ethers.getContractFactory("MockRouterV3");
    const router = await Router.deploy();
    await router.waitForDeployment();

    const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
    const r = await Receiver.deploy();
    await r.waitForDeployment();

    await r.setSwapRouter(await router.getAddress());
    // Intentionally no quoter set -> fallback minOut=0

    const vaultAddr = await vault.getAddress();
    const receiverAddr = await r.getAddress();

    const loanAmount = ethers.parseEther("10");
    await tokenIn.mint(vaultAddr, ethers.parseEther("1000"));
    await tokenOut.mint(await router.getAddress(), ethers.parseEther("1000"));

    await router.setAmountOut(ethers.parseEther("1")); // tiny output but >= 0 is fine

    await tokenIn.mint(receiverAddr, ethers.parseEther("1")); // fee buffer

    // Should not revert due to minOut=0
    await vault.flashLoan(receiverAddr, [await tokenIn.getAddress(), await tokenOut.getAddress()], [loanAmount, 0n], "0x");

    const receiverOut = await tokenOut.balanceOf(receiverAddr);
    expect(receiverOut).to.equal(ethers.parseEther("1"));
  });
});
