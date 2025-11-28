const { createPublicClient, createWalletClient, http, parseAbi, getContract, privateKeyToAccount } = require("viem");

const ABI = parseAbi([
  "function registerSector(uint256,string,string)",
  "function registerAgent(uint256,uint256,string)",
  "function logTrade(uint256,uint256,uint256,string,uint256)",
  "function validateAction(uint256,uint256,string,uint256) view returns (bool)"
]);

// Public client for reads
const publicClient = createPublicClient({
  chain: { id: 31337 },
  transport: http("http://localhost:8545")
});

// Wallet client for writes (using default Hardhat account if no private key provided)
const privateKey = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat account #0
const account = privateKeyToAccount(privateKey);

const walletClient = createWalletClient({
  account,
  chain: { id: 31337 },
  transport: http("http://localhost:8545")
});

const CONTRACT_ADDRESS = process.env.MAX_REGISTRY;

// Read-only contract instance
const readContract = getContract({
  address: CONTRACT_ADDRESS,
  abi: ABI,
  client: publicClient
});

// Write contract instance
const writeContract = getContract({
  address: CONTRACT_ADDRESS,
  abi: ABI,
  client: walletClient
});

// Combined registry with read and write namespaces
module.exports.registry = {
  read: readContract,
  write: writeContract
};
