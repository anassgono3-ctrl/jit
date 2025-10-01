import { ethers } from 'ethers';
import logger from '../../modules/logger';
import { simulateAndSend } from '../../runtime/safety';

// Execution skeleton: flashloan -> swap/liquidity -> repay.
// Safe by default: only simulates/logs unless DRY_RUN=false and required env set.
export interface ExecutionConfig {
  vault: string;          // Balancer Vault address
  receiver: string;       // deployed BalancerFlashJitReceiver
  tokens: string[];       // tokens to borrow (addresses)
  amounts: bigint[];      // amounts per token
  userData?: string;      // optional encoded data
}

export async function executeFlashloanSwapRepay(
  signer: ethers.Signer,
  cfg: ExecutionConfig
) {
  const dry = String(process.env.DRY_RUN || 'true').toLowerCase() === 'true';
  if (!cfg.vault || !cfg.receiver || cfg.tokens.length === 0 || cfg.amounts.length === 0) {
    logger.warn('[exec] missing vault/receiver/tokens/amounts — skipping execution');
    return;
  }
  if (cfg.tokens.length !== cfg.amounts.length) {
    logger.error('[exec] tokens/amounts length mismatch');
    return;
  }

  // Keep sizes tiny in safe mode
  const safeMode = String(process.env.EXECUTION_SAFE_MODE || 'true').toLowerCase() === 'true';

  const vaultIface = new ethers.Interface([
    'function flashLoan(address recipient, address[] tokens, uint256[] amounts, bytes userData) external'
  ]);
  // scale down if safeMode
  const scaled = cfg.amounts.map((x) => (safeMode ? x / 10n : x));
  const data = vaultIface.encodeFunctionData('flashLoan', [
    cfg.receiver,
    cfg.tokens,
    scaled,
    (cfg.userData && cfg.userData !== '0x') ? cfg.userData : '0x'
  ]);

  const txReq: ethers.TransactionRequest = {
    to: cfg.vault,
    data,
    // Let provider estimate gas; keep maxFee in DRY_RUN only
    // value: 0
  };

  if (dry) {
    logger.info(
      { vault: cfg.vault, receiver: cfg.receiver, tokens: cfg.tokens, amounts: scaled.map(String) },
      '[exec] DRY_RUN=true — would execute flashloan'
    );
    // Optional static simulation if you want to validate calldata shape:
    const provider = (signer as any).provider as ethers.Provider;
    try {
      await provider.call({ from: await signer.getAddress(), to: cfg.vault, data });
      logger.info('[exec] simulation ok');
    } catch (e) {
      logger.warn({ err: String((e as any)?.message || e) }, '[exec] simulation failed (expected on fork/mainnet without preconditions)');
    }
    return;
  }

  // Live path (pre-simulate then send)
  await simulateAndSend({
    signer,
    txFactory: async () => txReq,
    label: 'flashloan:swap:repay',
  });
  logger.info('[exec] flashloan path submitted');
}
