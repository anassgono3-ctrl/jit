// Minimal Flashbots wrapper with safe fallback and basic bundle attempt.
// NOTE: This is intentionally conservative and dependency-light.
// For production, consider integrating a full-featured Flashbots SDK.
import { ethers } from 'ethers';
import logger from '../modules/logger';

export interface FlashbotsConfig {
  relayUrl?: string;            // default https://relay.flashbots.net
  authKey?: string;             // 0x... private key for auth (not bot signer)
  targetBlockNumber?: number;   // optional block target for bundle
  blockOffset?: number;         // new
}

async function trySendBundle(
  signedTx: string[],
  relayUrl: string,
  authKey: string,
  targetBlockNumber: number
) {
  const authWallet = new ethers.Wallet(authKey);
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_sendBundle',
    params: [{
      txs: signedTx,
      blockNumber: ethers.toBeHex(targetBlockNumber),
      minTimestamp: 0,
      maxTimestamp: 0,
      revertingTxHashes: []
    }]
  };
  const payload = JSON.stringify(body);
  const sig = `${await authWallet.getAddress()}:${await authWallet.signMessage(ethers.getBytes(ethers.id(payload)))}`;

  const res = await fetch(relayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Flashbots-Signature': sig
    } as any,
    body: payload
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[flashbots] relay error ${res.status}: ${txt}`);
  }
  return res.json();
}

export async function sendViaFlashbotsOrDefault(
  signer: ethers.Signer,
  tx: ethers.TransactionRequest,
  cfg?: FlashbotsConfig
) {
  const relay = cfg?.relayUrl || process.env.FLASHBOTS_RELAY_URL || 'https://relay.flashbots.net';
  const authKey = cfg?.authKey || process.env.FLASHBOTS_SIGNER_KEY;
  const provider = (signer as any).provider as ethers.Provider;
  const forceBundle = String(process.env.FLASHBOTS_BUNDLE || '').toLowerCase() === 'true';

  if (!authKey || !provider || !forceBundle) {
    // Default send if Flashbots not fully configured or bundle not requested
    return signer.sendTransaction(tx);
  }

  // Build and sign tx, then try bundle submission to target block+offset
  const head = await provider.getBlockNumber();
  const blockOffset = cfg?.blockOffset ?? Number(process.env.FLASHBOTS_BLOCK_OFFSET || 1);
  const target = head + blockOffset;

  const populated = await signer.populateTransaction(tx);
  const signed = await (signer as ethers.Wallet).signTransaction(populated);

  try {
    const out = await trySendBundle([signed], relay, authKey, target);
    // Not all relays return a handle we can await; we return the relay response for observability
    return out;
  } catch (e) {
    logger.warn({ err: String((e as any)?.message || e) }, '[flashbots] bundle failed; falling back to default send');
    return signer.sendTransaction(tx);
  }
}
