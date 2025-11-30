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

  console.log("Loaded discussions for sector:", manager.discussions || manager.debates);

  header("Summary Before New Discussion");
  console.log(manager.getSummary());

  // Open a new discussion
  header("Opening New Discussion");
  const newDiscussion = await (manager.openDiscussion || manager.openDebate)(
    "Manager Test Discussion",
    ["agent1", "agent2"]
  );

  console.log("New Discussion Created:");
  console.log(newDiscussion);

  // Reload to confirm persistence
  header("Reloading After Save");
  await manager.loadState();
  console.log("Discussions Now:", manager.discussions || manager.debates);

  header("Final Summary");
  console.log(manager.getSummary());

  header("ManagerAgent Test Completed");
}

run();
