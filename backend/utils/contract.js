const { createPublicClient, http, parseAbi, getContract } = require("viem");

const ABI = parseAbi([
  "function registerSector(uint256,string,string)",
  "function registerAgent(uint256,uint256,string)",
  "function logTrade(uint256,uint256,uint256,string,uint256)",
  "function validateAction(uint256,uint256,string,uint256) view returns (bool)"
]);

const client = createPublicClient({
  chain: { id: 31337 },
  transport: http("http://localhost:8545")
});

const CONTRACT_ADDRESS = process.env.MAX_REGISTRY;

module.exports.registry = getContract({
  address: CONTRACT_ADDRESS,
  abi: ABI,
  client: client
});

