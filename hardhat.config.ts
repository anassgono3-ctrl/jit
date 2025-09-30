import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const blockNumber =
  process.env.FORK_BLOCK_NUMBER && !Number.isNaN(Number(process.env.FORK_BLOCK_NUMBER))
    ? Number(process.env.FORK_BLOCK_NUMBER)
    : 19000000;

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
  paths: {
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts"
  }
};

export default config;