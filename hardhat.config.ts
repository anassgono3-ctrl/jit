import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: { 
          optimizer: { 
            enabled: true, 
            runs: 200 
          }
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
            // Pin block for reproducibility; adjust as needed
            blockNumber: 19000000
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