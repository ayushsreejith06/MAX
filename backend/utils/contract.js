const { createPublicClient, createWalletClient, http, parseAbi, getContract } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const ABI = parseAbi([
  "function registerSector(uint256,string,string)",
  "function registerAgent(uint256,uint256,string)",
  "function logTrade(uint256,uint256,uint256,string,uint256)",
  "function validateAction(uint256,uint256,string,uint256) view returns (bool)"
]);

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const CONTRACT_ADDRESS = process.env.MAX_REGISTRY;

// Public client for reads
const publicClient = createPublicClient({
  chain: { id: 31337 },
  transport: http(RPC_URL)
});

// Create account and wallet client for write operations
const account = privateKeyToAccount(process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const walletClient = createWalletClient({
  account,
  chain: { id: 31337 },
  transport: http(RPC_URL)
});

// Single contract instance with both public and wallet clients
const registry = getContract({
  address: CONTRACT_ADDRESS,
  abi: ABI,
  client: {
    public: publicClient,
    wallet: walletClient
  }
});

module.exports.registry = registry;
