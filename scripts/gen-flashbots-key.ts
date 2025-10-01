/* scripts/gen-flashbots-key.ts
 * Generates an unfunded wallet for Flashbots relay auth and updates .env with FLASHBOTS_SIGNER_KEY.
 */
import { Wallet } from "ethers";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const wallet = Wallet.createRandom();
  console.log(`[flashbots] new Flashbots auth key: ${wallet.privateKey}`);
  console.log(`[flashbots] address: ${wallet.address}`);

  // Append or replace in .env
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, "utf8");
    if (!content.includes("FLASHBOTS_SIGNER_KEY=")) {
      content += `\nFLASHBOTS_SIGNER_KEY=${wallet.privateKey}\n`;
    } else {
      content = content.replace(/FLASHBOTS_SIGNER_KEY=.*/g, `FLASHBOTS_SIGNER_KEY=${wallet.privateKey}`);
    }
    fs.writeFileSync(envPath, content);
    console.log(`[flashbots] .env updated with FLASHBOTS_SIGNER_KEY`);
  } else {
    console.log(`[flashbots] no .env file found; please copy .env.example and set FLASHBOTS_SIGNER_KEY=${wallet.privateKey}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
