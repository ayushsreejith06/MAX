import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying MaxRegistry with account:", deployer.address);

  const MaxRegistry = await hre.ethers.getContractFactory("MaxRegistry");
  const registry = await MaxRegistry.deploy();
  await registry.waitForDeployment();

  const owner = await registry.owner();
  console.log("MaxRegistry deployed to:", registry.target);
  console.log("Contract owner set to:", owner);
  
  // Verify owner is the deployer
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("Owner mismatch: expected deployer to be owner");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

