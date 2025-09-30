import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

// Default to a "known-good" block for Balancer flashloans; still overridable via FORK_BLOCK_NUMBER
const defaultPinnedBlock = 19350000; // ~2025-01-20
const blockNumber =
  process.env.FORK_BLOCK_NUMBER && !Number.isNaN(Number(process.env.FORK_BLOCK_NUMBER))
    ? Number(process.env.FORK_BLOCK_NUMBER)
    : defaultPinnedBlock;

const mochaTimeout = process.env.MOCHA_TIMEOUT_MS
  ? Number(process.env.MOCHA_TIMEOUT_MS)
  : 120_000; // 2 minutes default

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
    sepolia: {
      url: process.env.FORK_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
    }
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