import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with", deployer.address);

  const Receiver = await ethers.getContractFactory("BalancerFlashJitReceiver");
  const receiver = await Receiver.deploy();
  await receiver.deployed();
  console.log("Receiver deployed:", receiver.address);

  const MockVault = await ethers.getContractFactory("MockVault");
  const vault = await MockVault.deploy();
  await vault.deployed();
  console.log("MockVault deployed:", vault.address);

  // fund tokens & run a local test manually if desired.
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });