import { expect } from "chai";
import { ethers } from "hardhat";

describe("MaxRegistry Access Control", function () {
  let maxRegistry;
  let owner;
  let nonOwner;
  let ownerAddress;
  let nonOwnerAddress;

  beforeEach(async function () {
    // Get signers
    [owner, nonOwner] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    nonOwnerAddress = await nonOwner.getAddress();

    // Deploy contract
    const MaxRegistry = await ethers.getContractFactory("MaxRegistry");
    maxRegistry = await MaxRegistry.deploy();
    await maxRegistry.waitForDeployment();
  });

  describe("Ownership", function () {
    it("Should set deployer as owner", async function () {
      const contractOwner = await maxRegistry.owner();
      expect(contractOwner).to.equal(ownerAddress);
    });

    it("Should allow owner to transfer ownership", async function () {
      await expect(maxRegistry.connect(owner).transferOwnership(nonOwnerAddress))
        .to.emit(maxRegistry, "OwnershipTransferred")
        .withArgs(ownerAddress, nonOwnerAddress);

      const newOwner = await maxRegistry.owner();
      expect(newOwner).to.equal(nonOwnerAddress);
    });

    it("Should reject ownership transfer to zero address", async function () {
      await expect(
        maxRegistry.connect(owner).transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("MaxRegistry: new owner is the zero address");
    });

    it("Should reject ownership transfer from non-owner", async function () {
      await expect(
        maxRegistry.connect(nonOwner).transferOwnership(nonOwnerAddress)
      ).to.be.revertedWith("MaxRegistry: caller is not the owner");
    });
  });

  describe("registerSector Access Control", function () {
    it("Should allow owner to register sector", async function () {
      await expect(
        maxRegistry.connect(owner).registerSector(1, "Technology", "TECH")
      )
        .to.emit(maxRegistry, "SectorRegistered")
        .withArgs(1, "Technology", "TECH", ownerAddress);

      const sector = await maxRegistry.sectors(1);
      expect(sector.id).to.equal(1);
      expect(sector.name).to.equal("Technology");
      expect(sector.symbol).to.equal("TECH");
    });

    it("Should reject sector registration from non-owner", async function () {
      await expect(
        maxRegistry.connect(nonOwner).registerSector(1, "Technology", "TECH")
      ).to.be.revertedWith("MaxRegistry: caller is not the owner");
    });
  });

  describe("registerAgent Access Control", function () {
    beforeEach(async function () {
      // Register a sector first (as owner)
      await maxRegistry.connect(owner).registerSector(1, "Technology", "TECH");
    });

    it("Should allow owner to register agent", async function () {
      await expect(
        maxRegistry.connect(owner).registerAgent(1, 1, "Researcher")
      )
        .to.emit(maxRegistry, "AgentRegistered")
        .withArgs(1, 1, "Researcher", ownerAddress);

      const agent = await maxRegistry.agents(1);
      expect(agent.id).to.equal(1);
      expect(agent.sectorId).to.equal(1);
      expect(agent.role).to.equal("Researcher");
    });

    it("Should reject agent registration from non-owner", async function () {
      await expect(
        maxRegistry.connect(nonOwner).registerAgent(1, 1, "Researcher")
      ).to.be.revertedWith("MaxRegistry: caller is not the owner");
    });
  });

  describe("logTrade Access Control", function () {
    beforeEach(async function () {
      // Register sector and agent first (as owner)
      await maxRegistry.connect(owner).registerSector(1, "Technology", "TECH");
      await maxRegistry.connect(owner).registerAgent(1, 1, "Researcher");
    });

    it("Should allow owner to log trade", async function () {
      const tx = await maxRegistry.connect(owner).logTrade(1, 1, 1, "BUY", 100);
      await expect(tx)
        .to.emit(maxRegistry, "TradeLogged")
        .withArgs(1, 1, 1, "BUY", 100, await ethers.provider.getBlock("latest").then(b => b.timestamp));

      const trade = await maxRegistry.trades(1);
      expect(trade.id).to.equal(1);
      expect(trade.agentId).to.equal(1);
      expect(trade.sectorId).to.equal(1);
      expect(trade.action).to.equal("BUY");
      expect(trade.amount).to.equal(100);
    });

    it("Should reject trade logging from non-owner", async function () {
      await expect(
        maxRegistry.connect(nonOwner).logTrade(1, 1, 1, "BUY", 100)
      ).to.be.revertedWith("MaxRegistry: caller is not the owner");
    });
  });

  describe("validateAction Access Control", function () {
    beforeEach(async function () {
      // Register sector and agent first (as owner)
      await maxRegistry.connect(owner).registerSector(1, "Technology", "TECH");
      await maxRegistry.connect(owner).registerAgent(1, 1, "Researcher");
    });

    it("Should allow anyone to call validateAction (view function)", async function () {
      const result = await maxRegistry.connect(nonOwner).validateAction(1, 1, "BUY", 100);
      expect(result).to.be.true;
    });
  });

  describe("Access Control After Ownership Transfer", function () {
    beforeEach(async function () {
      // Transfer ownership to nonOwner
      await maxRegistry.connect(owner).transferOwnership(nonOwnerAddress);
    });

    it("Should allow new owner to register sector", async function () {
      await expect(
        maxRegistry.connect(nonOwner).registerSector(1, "Technology", "TECH")
      )
        .to.emit(maxRegistry, "SectorRegistered")
        .withArgs(1, "Technology", "TECH", nonOwnerAddress);
    });

    it("Should reject old owner from registering sector", async function () {
      await expect(
        maxRegistry.connect(owner).registerSector(1, "Technology", "TECH")
      ).to.be.revertedWith("MaxRegistry: caller is not the owner");
    });
  });
});

