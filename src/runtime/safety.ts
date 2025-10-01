// src/runtime/safety.ts
import { ethers } from 'ethers';
import logger from '../modules/logger';
import { txSentTotal, txFailedTotal } from '../metrics';

/**
 * Simulate an EVM call before sending a live transaction.
 * - txFactory should return a populated tx (to, data, value, gasLimit optionally).
 * - signer must be connected to the target network.
 */
export async function simulateAndSend(opts: {
  signer: ethers.Signer;
  txFactory: () => Promise<ethers.TransactionRequest> | ethers.TransactionRequest;
  label?: string;
}) {
  const { signer, txFactory, label } = opts;

  const txRequest = await txFactory();

  // provider.call — static simulation (no state change)
  const provider = (signer as any).provider as ethers.Provider;
  if (!provider) {
    throw new Error('Signer has no provider');
  }

  try {
    await provider.call({
      from: await signer.getAddress(),
      to: txRequest.to!,
      data: txRequest.data,
      value: txRequest.value,
    });
  } catch (err) {
    txFailedTotal.inc();
    logger.error({ err, label }, '[safety] simulation failed — aborting send');
    throw err;
  }

  try {
    const sent = await signer.sendTransaction(txRequest);
    txSentTotal.inc();
    const receipt = await sent.wait();
    logger.info({ label, hash: sent.hash, status: receipt?.status }, '[safety] tx sent + confirmed');
    return receipt;
  } catch (err) {
    txFailedTotal.inc();
    logger.error({ err, label }, '[safety] tx send failed');
    throw err;
  }
}
