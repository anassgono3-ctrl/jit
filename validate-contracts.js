const fs = require('fs');
const solc = require('solc');
const path = require('path');

// Read contract files
const receiverSource = fs.readFileSync('contracts/BalancerFlashJitReceiver.sol', 'utf8');
const vaultSource = fs.readFileSync('contracts/MockVault.sol', 'utf8');
const erc20Source = fs.readFileSync('contracts/test/ERC20PresetMinterPauser.sol', 'utf8');

// Compile input
const input = {
  language: 'Solidity',
  sources: {
    'BalancerFlashJitReceiver.sol': { content: receiverSource },
    'MockVault.sol': { content: vaultSource },
    'ERC20Mock.sol': { content: erc20Source }
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['*']
      }
    },
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
};

try {
  console.log('Validating Solidity contracts...');
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    let hasErrors = false;
    output.errors.forEach(error => {
      if (error.severity === 'error') {
        console.error('ERROR:', error.message);
        hasErrors = true;
      } else {
        console.warn('WARNING:', error.message);
      }
    });
    if (hasErrors) {
      process.exit(1);
    }
  }
  
  console.log('✅ All contracts compiled successfully!');
  console.log('Contracts found:');
  Object.keys(output.contracts).forEach(fileName => {
    Object.keys(output.contracts[fileName]).forEach(contractName => {
      console.log(`  - ${contractName} (${fileName})`);
    });
  });
  
} catch (error) {
  console.error('Compilation failed:', error.message);
  process.exit(1);
}
