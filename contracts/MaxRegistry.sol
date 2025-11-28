// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MaxRegistry {
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
    ) external {
        sectors[sectorId] = Sector({
            id: sectorId,
            name: name,
            symbol: symbol,
            creator: msg.sender
        });
    }

    function registerAgent(
        uint256 agentId,
        uint256 sectorId,
        string calldata role
    ) external {
        agents[agentId] = Agent({
            id: agentId,
            sectorId: sectorId,
            role: role,
            creator: msg.sender
        });
    }
}

