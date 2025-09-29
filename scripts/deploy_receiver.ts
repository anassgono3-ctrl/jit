import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with", deployer.address);

  const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
  const receiver = await Receiver.deploy();
  await receiver.waitForDeployment();
  const receiverAddr = await receiver.getAddress();
  console.log("Receiver deployed:", receiverAddr);

  const MockVault = await ethers.getContractFactory("MockVault");
  const vault = await MockVault.deploy();
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("MockVault deployed:", vaultAddr);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
