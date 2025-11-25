// backend/test/managerTest.js
const path = require("path");

// Load ManagerAgent
const ManagerAgent = require("../agents/manager/ManagerAgent");

// Simple helper so logs look nicer
function header(title) {
  console.log("\n==============================");
  console.log(title);
  console.log("==============================\n");
}

async function run() {
  header("ManagerAgent Test Start");

  // Use any valid sectorId you have in sectors.json
  const testSectorId = "sector-001"; // ← CHANGE IF NEEDED

  const manager = new ManagerAgent(testSectorId);

  header("Loading ManagerAgent State");
  await manager.loadState();

  console.log("Loaded debates for sector:", manager.debates);

  header("Summary Before New Debate");
  console.log(manager.getSummary());

  // Open a new debate
  header("Opening New Debate");
  const newDebate = await manager.openDebate(
    "Manager Test Debate",
    ["agent1", "agent2"]
  );

  console.log("New Debate Created:");
  console.log(newDebate);

  // Reload to confirm persistence
  header("Reloading After Save");
  await manager.loadState();
  console.log("Debates Now:", manager.debates);

  header("Final Summary");
  console.log(manager.getSummary());

  header("ManagerAgent Test Completed");
}

run();
