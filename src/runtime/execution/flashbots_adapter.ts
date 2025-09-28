/**
 * Flashbots adapter stub; integrate with real relay later.
 */
export interface FlashbotsBundle {
  txs: string[];
  targetBlock?: number;
}

export class FlashbotsAdapter {
  constructor(public relayUrl: string) {}

  async submitBundle(_bundle: FlashbotsBundle): Promise<{ ok: boolean; bundleHash?: string; error?: string }> {
    // Stub
    return { ok: true, bundleHash: '0xflashbots_bundle_stub' };
    // Real implementation: sign + submit bundle via relay
  }
}