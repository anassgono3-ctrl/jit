const solc = require('solc');
const fs = require('fs');
const path = require('path');

const contractsDir = './contracts';
const testDir = path.join(contractsDir, 'test');

// Read contract files
const mockVault = fs.readFileSync(path.join(contractsDir, 'MockVault.sol'), 'utf8');
const receiver = fs.readFileSync(path.join(contractsDir, 'BalancerFlashJitReceiver.sol'), 'utf8');
const erc20Mock = fs.readFileSync(path.join(testDir, 'ERC20PresetMinterPauser.sol'), 'utf8');
const badReceiver = fs.readFileSync(path.join(testDir, 'BadReceiver.sol'), 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'MockVault.sol': { content: mockVault },
    'BalancerFlashJitReceiver.sol': { content: receiver },
    'ERC20Mock.sol': { content: erc20Mock },
    'BadReceiver.sol': { content: badReceiver }
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode']
      }
    }
  }
};

try {
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    console.log('Compilation errors:');
    output.errors.forEach(error => console.log(error.formattedMessage));
  }
  
  if (output.contracts) {
    console.log('Contracts compiled successfully!');
    console.log('Available contracts:', Object.keys(output.contracts));
  }
} catch (error) {
  console.error('Compilation failed:', error);
}