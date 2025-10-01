import { ethers } from 'ethers';
import logger from '../../modules/logger';
import { simulateAndSend } from '../../runtime/safety';
import { sendViaFlashbotsOrDefault } from '../../tx/flashbots';

// Execution skeleton: flashloan -> swap/liquidity -> repay.
// Safe by default: DRY_RUN=true simulates; EXECUTION_SAFE_MODE reduces sizes off-chain as well.
export interface ExecutionConfig {
  vault: string;          // Balancer Vault address
  receiver: string;       // deployed BalancerFlashJitReceiver
  tokens: string[];       // tokens to borrow (addresses)
  amounts: bigint[];      // amounts per token
  userData?: string;      // optional encoded data (not required for minimal path)
}

export async function executeFlashloanSwapRepay(
  signer: ethers.Signer,
  cfg: ExecutionConfig
) {
  const dry = String(process.env.DRY_RUN || 'true').toLowerCase() === 'true';
  const safeMode = String(process.env.EXECUTION_SAFE_MODE || 'true').toLowerCase() === 'true';
  if (!cfg.vault || !cfg.receiver || cfg.tokens.length === 0 || cfg.amounts.length === 0) {
    logger.warn('[exec] missing vault/receiver/tokens/amounts — skipping execution');
    return;
  }
  if (cfg.tokens.length !== cfg.amounts.length) {
    logger.error('[exec] tokens/amounts length mismatch');
    return;
  }

  const vaultIface = new ethers.Interface([
    'function flashLoan(address recipient, address[] tokens, uint256[] amounts, bytes userData) external'
  ]);
  const scaled = cfg.amounts.map((x) => (safeMode ? (x > 0n ? x / 10n : 0n) : x));
  const data = vaultIface.encodeFunctionData('flashLoan', [
    cfg.receiver,
    cfg.tokens,
    scaled,
    (cfg.userData && cfg.userData !== '0x') ? cfg.userData : '0x'
  ]);

  const txReq: ethers.TransactionRequest = { to: cfg.vault, data };

  if (dry) {
    logger.info(
      { vault: cfg.vault, receiver: cfg.receiver, tokens: cfg.tokens, amounts: scaled.map(String) },
      '[exec] DRY_RUN=true — would execute flashloan'
    );
    // Optional static simulation
    const provider = (signer as any).provider as ethers.Provider;
    try {
      await provider.call({ from: await signer.getAddress(), to: cfg.vault, data });
      logger.info('[exec] simulation ok');
    } catch (e) {
      logger.warn({ err: String((e as any)?.message || e) }, '[exec] simulation failed (expected in some conditions)');
    }
    return;
  }

  // Live path: simulate then send (Flashbots if configured)
  await simulateAndSend({
    signer,
    txFactory: async () => txReq,
    label: 'flashloan:swap:repay',
  });

  // Optional: try Flashbots bundle if requested (experimental)
  if (String(process.env.FLASHBOTS_BUNDLE || '').toLowerCase() === 'true') {
    await sendViaFlashbotsOrDefault(signer, txReq);
  }

  logger.info('[exec] flashloan path submitted');
}
