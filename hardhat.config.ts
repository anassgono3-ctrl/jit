import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

// Default "known-good" block; test may programmatically reset to others
const defaultPinnedBlock = 19350000;
const blockNumber =
  process.env.FORK_BLOCK_NUMBER && !Number.isNaN(Number(process.env.FORK_BLOCK_NUMBER))
    ? Number(process.env.FORK_BLOCK_NUMBER)
    : defaultPinnedBlock;

const mochaTimeout = process.env.MOCHA_TIMEOUT_MS ? Number(process.env.MOCHA_TIMEOUT_MS) : 120_000;

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: { enabled: true, runs: 200 }
        }
      }
    ]
  },
  networks: {
    hardhat: {
      chainId: 1,
      forking: process.env.FORK_RPC_URL
        ? {
            url: process.env.FORK_RPC_URL,
            blockNumber
          }
        : undefined
    },
    // Minimal mainnet config for deployments via scripts/deploy-receiver.ts
    mainnet: {
      url: process.env.PRIMARY_RPC_HTTP || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    // Optional: if you plan to use sepolia, set SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY
    // sepolia: {
    //   url: process.env.SEPOLIA_RPC_URL || "",
    //   accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
    // }
  },
  mocha: {
    timeout: mochaTimeout,
    slow: 6000
  },
  paths: {
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts"
  }
};

export default config;