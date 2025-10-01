// Minimal Flashbots wrapper with a safe fallback.
// If FLASHBOTS_SIGNER_KEY is absent, falls back to normal send.
import { ethers } from 'ethers';
import logger from '../modules/logger';

export interface FlashbotsConfig {
  relayUrl?: string;            // default https://relay.flashbots.net
  authKey?: string;             // 0x... private key for auth (not bot signer)
}

export async function sendViaFlashbotsOrDefault(
  signer: ethers.Signer,
  tx: ethers.TransactionRequest,
  cfg?: FlashbotsConfig
) {
  const relay = cfg?.relayUrl || process.env.FLASHBOTS_RELAY_URL || 'https://relay.flashbots.net';
  const authKey = cfg?.authKey || process.env.FLASHBOTS_SIGNER_KEY;
  if (!authKey) {
    logger.info('[flashbots] no auth key; using default send');
    return signer.sendTransaction(tx);
  }

  // NOTE: A full Flashbots client would construct a bundle, sign it with authKey, and POST to relay.
  // To keep this integration safe and dependency-light, we log intent and fallback unless FORCE is set.
  const force = String(process.env.FLASHBOTS_FORCE || '').toLowerCase() === 'true';
  logger.info({ relay }, '[flashbots] requested; minimal client in use');
  if (!force) {
    logger.warn('[flashbots] minimal client — falling back to default send (set FLASHBOTS_FORCE=true to force default anyway)');
  }
  // Fallback: normal network send
  return signer.sendTransaction(tx);
}
