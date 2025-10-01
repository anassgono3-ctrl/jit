/* scripts/deploy-receiver.ts
 * Deploys BalancerFlashJitReceiver and updates .env with RECEIVER_ADDRESS.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

async function main() {
  dotenv.config();
  const [deployer] = await ethers.getSigners();
  console.log(`[deploy] using deployer: ${deployer.address}`);

  const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
  const receiver = await Receiver.deploy();
  await receiver.waitForDeployment();

  const address = await receiver.getAddress();
  console.log(`[deploy] BalancerFlashJitReceiver deployed at: ${address}`);

  // Update .env with RECEIVER_ADDRESS
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, "utf8");
    if (!content.includes("RECEIVER_ADDRESS=")) {
      content += `\nRECEIVER_ADDRESS=${address}\n`;
    } else {
      content = content.replace(/RECEIVER_ADDRESS=.*/g, `RECEIVER_ADDRESS=${address}`);
    }
    fs.writeFileSync(envPath, content);
    console.log(`[deploy] .env updated with RECEIVER_ADDRESS`);
  } else {
    console.log(`[deploy] no .env file found; please copy .env.example and set RECEIVER_ADDRESS=${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
