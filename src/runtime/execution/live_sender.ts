import { loadConfig } from '../../config';
import logger from '../../modules/logger';

export interface SendResult {
  ok: boolean;
  txHash?: string;
  error?: string;
  mode: 'dry_run' | 'flashbots' | 'legacy';
}

/**
 * Live sender adapter:
 * - Requires DRY_RUN=false and PRIVATE_KEY matching 0x + 64 hex
 * - Flashbots path optional (stubbed); otherwise legacy send (stubbed)
 * - This file is intentionally minimal and safe
 */
export class LiveSender {
  async sendSigned(tx: { to: string; data: string; value?: string }): Promise<SendResult> {
    const cfg = loadConfig();
    if (cfg.DRY_RUN) {
      logger.info('[live-sender] DRY_RUN=true; not sending');
      return { ok: true, mode: 'dry_run' };
    }
    if (!cfg.PRIVATE_KEY || !/^0x[0-9a-fA-F]{64}$/.test(cfg.PRIVATE_KEY)) {
      return { ok: false, error: 'Missing or invalid PRIVATE_KEY', mode: 'legacy' };
    }

    if (cfg.FLASHBOTS_RPC_URL) {
      logger.info('[live-sender] would send via Flashbots (stub)');
      // integrate actual FB submission later
      return { ok: true, mode: 'flashbots', txHash: '0xflashbots_stub' };
    }

    logger.info('[live-sender] would send via legacy provider (stub)');
    // integrate provider sendTransaction later
    return { ok: true, mode: 'legacy', txHash: '0xlegacy_stub' };
  }
}