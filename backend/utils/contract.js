const { createPublicClient, createWalletClient, http, parseAbi, getContract } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const ABI = parseAbi([
  "function registerSector(uint256,string,string)",
  "function registerAgent(uint256,uint256,string)",
  "function logTrade(uint256,uint256,uint256,string,uint256)",
  "function validateAction(uint256,uint256,string,uint256) view returns (bool)",
  "function sectors(uint256) view returns (uint256 id, string name, string symbol, address creator)",
  "function agents(uint256) view returns (uint256 id, uint256 sectorId, string role, address creator)",
  "function trades(uint256) view returns (uint256 id, uint256 agentId, uint256 sectorId, string action, uint256 amount, uint256 timestamp)",
  "event SectorRegistered(uint256 indexed id, string name, string symbol, address creator)",
  "event AgentRegistered(uint256 indexed id, uint256 indexed sectorId, string role, address creator)",
  "event TradeLogged(uint256 indexed id, uint256 indexed agentId, uint256 indexed sectorId, string action, uint256 amount, uint256 timestamp)"
]);

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const CONTRACT_ADDRESS = process.env.MAX_REGISTRY;

// Public client for reads
const publicClient = createPublicClient({
  chain: { id: 31337 },
  transport: http(RPC_URL)
});

// Create account and wallet client for write operations
// Ensure private key has 0x prefix if provided
let privateKey = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// Remove any comments or extra text from private key
if (privateKey) {
  privateKey = privateKey.split('#')[0].trim(); // Remove comments
  if (!privateKey.startsWith("0x")) {
    privateKey = "0x" + privateKey;
  }
}
// Validate private key length (should be 66 chars with 0x prefix = 64 hex chars)
if (privateKey && privateKey.length !== 66) {
  console.warn(`Invalid private key length: ${privateKey.length}. Using default Hardhat account.`);
  privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
}
const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({
  account,
  chain: { id: 31337 },
  transport: http(RPC_URL)
});

// Single contract instance with both public and wallet clients
// Only create registry if contract address is provided
let registry = null;
if (CONTRACT_ADDRESS) {
  registry = getContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    client: {
      public: publicClient,
      wallet: walletClient
    }
  });
}

module.exports.registry = registry;
module.exports.publicClient = publicClient;
module.exports.walletClient = walletClient;
