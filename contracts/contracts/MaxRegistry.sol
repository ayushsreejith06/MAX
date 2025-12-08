// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MaxRegistry {
    // Ownership
    address public owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // Structures
    struct Sector {
        uint256 id;
        string name;
        string symbol;
        address creator;
    }

    struct Agent {
        uint256 id;
        uint256 sectorId;
        string role;
        address creator;
    }

    struct Trade {
        uint256 id;
        uint256 agentId;
        uint256 sectorId;
        string action; // "BUY" | "SELL"
        uint256 amount;
        uint256 timestamp;
    }

    // Events
    event SectorRegistered(uint256 indexed id, string name, string symbol, address creator);
    event AgentRegistered(uint256 indexed id, uint256 indexed sectorId, string role, address creator);
    event TradeLogged(uint256 indexed id, uint256 indexed agentId, uint256 indexed sectorId, string action, uint256 amount, uint256 timestamp);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "MaxRegistry: caller is not the owner");
        _;
    }

    // Constructor
    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // Storage
    mapping(uint256 => Sector) public sectors;
    mapping(uint256 => Agent) public agents;
    mapping(uint256 => Trade) public trades;

    // Auto-increment counters
    uint256 private sectorCounter;
    uint256 private agentCounter;
    uint256 private tradeCounter;

    // Functions
    function registerSector(
        uint256 sectorId,
        string calldata name,
        string calldata symbol
    ) external onlyOwner {
        sectors[sectorId] = Sector({
            id: sectorId,
            name: name,
            symbol: symbol,
            creator: msg.sender
        });
        emit SectorRegistered(sectorId, name, symbol, msg.sender);
    }

    function registerAgent(
        uint256 agentId,
        uint256 sectorId,
        string calldata role
    ) external onlyOwner {
        agents[agentId] = Agent({
            id: agentId,
            sectorId: sectorId,
            role: role,
            creator: msg.sender
        });
        emit AgentRegistered(agentId, sectorId, role, msg.sender);
    }

    function logTrade(
        uint256 tradeId,
        uint256 agentId,
        uint256 sectorId,
        string calldata action,
        uint256 amount
    ) external onlyOwner {
        uint256 timestamp = block.timestamp;
        trades[tradeId] = Trade({
            id: tradeId,
            agentId: agentId,
            sectorId: sectorId,
            action: action,
            amount: amount,
            timestamp: timestamp
        });
        emit TradeLogged(tradeId, agentId, sectorId, action, amount, timestamp);
    }

    function validateAction(
        uint256 agentId,
        uint256 sectorId,
        string calldata /* action */,
        uint256 /* amount */
    ) external view returns (bool) {
        // Placeholder - Phase 5 will enforce real MNEE rules
        // For now, basic validation: agent and sector must exist
        require(agents[agentId].id != 0, "Agent does not exist");
        require(sectors[sectorId].id != 0, "Sector does not exist");
        return true;
    }

    // Ownership management
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "MaxRegistry: new owner is the zero address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

