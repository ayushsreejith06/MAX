async function main() {
  const MaxRegistry = await ethers.getContractFactory("MaxRegistry");
  const registry = await MaxRegistry.deploy();

  await registry.deployed();

  console.log("MaxRegistry deployed to:", registry.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

