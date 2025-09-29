import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.19", // Keep original version but use local solc
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
      // forking disabled by default to keep CI deterministic and fast
      chainId: 1
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