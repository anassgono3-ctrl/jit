#!/usr/bin/env node
/**
 * Generate a Flashbots auth keypair.
 * Usage: node scripts/gen-flashbots-key.js
 *
 * WARNING: this prints a private key to stdout. Save it securely and add
 * it to your server secrets as FLASHBOTS_SIGNER_KEY. Do not commit it.
 */
const { Wallet } = require('ethers');

function main() {
  const wallet = Wallet.createRandom();
  console.log('# Flashbots signer key (keep secret!)');
  console.log('PRIVATE_KEY:', wallet.privateKey);
  console.log('ADDRESS:', wallet.address);
  console.log('');
  console.log('Add the private key to your .env or to your VPS secrets as FLASHBOTS_SIGNER_KEY.');
  console.log('This key is only used for Flashbots auth and does NOT need ETH funding.');
}

main();
