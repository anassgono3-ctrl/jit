const solc = require('solc');
const fs = require('fs');
const path = require('path');

// Read only the contracts we need for testing
const contractSources = {
  'ERC20Mock.sol': { content: fs.readFileSync('./contracts/test/ERC20PresetMinterPauser.sol', 'utf8') },
  'MockVault.sol': { content: fs.readFileSync('./contracts/MockVault.sol', 'utf8') },
  'BalancerFlashJitReceiver.sol': { content: fs.readFileSync('./contracts/BalancerFlashJitReceiver.sol', 'utf8') },
  'BadReceiver.sol': { content: fs.readFileSync('./contracts/test/BadReceiver.sol', 'utf8') }
};

const input = {
  language: 'Solidity',
  sources: contractSources,
  settings: {
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode']
      }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter(e => e.severity === 'error');
  if (errors.length > 0) {
    console.error('Compilation errors:', errors.map(e => e.formattedMessage));
    process.exit(1);
  }
}

// Create specific contract artifacts
const contractNames = ['ERC20Mock', 'MockVault', 'BalancerFlashJitReceiver', 'BadReceiver'];

contractNames.forEach(contractName => {
  // Find the contract in the output
  let contractData = null;
  for (const fileName of Object.keys(output.contracts)) {
    if (output.contracts[fileName][contractName]) {
      contractData = output.contracts[fileName][contractName];
      break;
    }
  }
  
  if (!contractData) {
    console.error(`Contract ${contractName} not found in compilation output`);
    return;
  }

  const artifact = {
    "_format": "hh-sol-artifact-1",
    "contractName": contractName,
    "sourceName": `${contractName}.sol`,
    "abi": contractData.abi,
    "bytecode": "0x" + contractData.evm.bytecode.object,
    "deployedBytecode": "0x" + (contractData.evm.deployedBytecode?.object || contractData.evm.bytecode.object),
    "linkReferences": contractData.evm.bytecode.linkReferences || {},
    "deployedLinkReferences": contractData.evm.deployedBytecode?.linkReferences || {}
  };

  const contractDir = `./artifacts/contracts/${contractName}.sol`;
  fs.mkdirSync(contractDir, { recursive: true });
  fs.writeFileSync(
    `${contractDir}/${contractName}.json`,
    JSON.stringify(artifact, null, 2)
  );
  
  console.log(`Created artifact for ${contractName}`);
});

console.log('All contract artifacts created successfully!');