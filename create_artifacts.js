const solc = require('solc');
const fs = require('fs');
const path = require('path');

// Create artifacts structure
const artifactsDir = './artifacts';
const contractsArtifactsDir = path.join(artifactsDir, 'contracts');

if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);
if (!fs.existsSync(contractsArtifactsDir)) fs.mkdirSync(contractsArtifactsDir);

// Read contract files
const contractsDir = './contracts';
const testDir = path.join(contractsDir, 'test');

const contracts = {
  'MockVault': fs.readFileSync(path.join(contractsDir, 'MockVault.sol'), 'utf8'),
  'BalancerFlashJitReceiver': fs.readFileSync(path.join(contractsDir, 'BalancerFlashJitReceiver.sol'), 'utf8'),
  'ERC20Mock': fs.readFileSync(path.join(testDir, 'ERC20PresetMinterPauser.sol'), 'utf8'),
  'BadReceiver': fs.readFileSync(path.join(testDir, 'BadReceiver.sol'), 'utf8')
};

const input = {
  language: 'Solidity',
  sources: Object.keys(contracts).reduce((acc, name) => {
    acc[`${name}.sol`] = { content: contracts[name] };
    return acc;
  }, {}),
  settings: {
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode', 'metadata']
      }
    }
  }
};

try {
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length > 0) {
      console.error('Compilation errors:');
      errors.forEach(error => console.error(error.formattedMessage));
      process.exit(1);
    }
  }

  if (output.contracts) {
    console.log('Creating artifacts...');
    
    Object.keys(output.contracts).forEach(fileName => {
      Object.keys(output.contracts[fileName]).forEach(contractName => {
        const contract = output.contracts[fileName][contractName];
        
        const deployedBytecode = contract.evm.deployedBytecode?.object || contract.evm.bytecode.object || "";
        
        // Create hardhat-compatible artifact
        const artifact = {
          _format: "hh-sol-artifact-1",
          contractName: contractName,
          sourceName: fileName,
          abi: contract.abi,
          bytecode: "0x" + contract.evm.bytecode.object,
          deployedBytecode: "0x" + deployedBytecode,
          linkReferences: contract.evm.bytecode.linkReferences || {},
          deployedLinkReferences: contract.evm.deployedBytecode?.linkReferences || {}
        };
        
        // Create directory structure
        const contractDir = path.join(contractsArtifactsDir, contractName + '.sol');
        if (!fs.existsSync(contractDir)) {
          fs.mkdirSync(contractDir, { recursive: true });
        }
        
        // Write artifact file
        fs.writeFileSync(
          path.join(contractDir, `${contractName}.json`),
          JSON.stringify(artifact, null, 2)
        );
        
        console.log(`Created artifact for ${contractName}`);
      });
    });
    
    // Create build-info file (required by hardhat)
    const buildInfoDir = path.join(artifactsDir, 'build-info');
    if (!fs.existsSync(buildInfoDir)) {
      fs.mkdirSync(buildInfoDir);
    }
    
    const buildInfo = {
      id: "test-build",
      _format: "hh-sol-build-info-1",
      solcVersion: "0.8.19",
      solcLongVersion: "0.8.19+commit.7dd6d404",
      input: input,
      output: output
    };
    
    fs.writeFileSync(
      path.join(buildInfoDir, 'test-build.json'),
      JSON.stringify(buildInfo, null, 2)
    );
    
    console.log('Artifacts created successfully!');
  }
} catch (error) {
  console.error('Failed to create artifacts:', error);
  process.exit(1);
}