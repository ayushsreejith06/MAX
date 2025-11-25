# MAX: Multi-Sector Agentic Financial Simulation

## Overview

MAX is a multi-sector NYSE-style agentic financial simulation platform where users create autonomous agents that debate, coordinate, and execute simulated trades using MNEE (Multi-Nodal Economic Exchange) principles. The system enables sophisticated financial modeling through intelligent agent interactions, sector-based market segmentation, and high-fidelity trading simulation.

## What is MAX?

MAX is a comprehensive financial simulation ecosystem that combines:

- **Autonomous Agent Creation**: Users can design and deploy intelligent trading agents (LLM-powered or rule-based)
- **Multi-Sector Markets**: NYSE-style market structure with sector-based organization
- **Agentic Coordination**: Agents debate, negotiate, and coordinate trading strategies in dedicated debate rooms
- **High-Fidelity Simulation**: Realistic orderbook mechanics and execution engine
- **Blockchain Integration**: Smart contract support for transparent and verifiable transactions
- **Modern UI/UX**: Intuitive interface for monitoring and interacting with the simulation

## Core Modules

### Sector System
Organizes the market into distinct sectors, enabling sector-specific analysis, agent specialization, and targeted trading strategies.

### Manager Agents
Autonomous supervisory agents that oversee market operations, manage sector dynamics, and coordinate between different market participants.

### User-Defined Agents
Flexible agent framework supporting:
- **LLM-Powered Agents**: Intelligent agents leveraging large language models for decision-making
- **Rule-Based Agents**: Deterministic agents following predefined trading rules
- **Hybrid Agents**: Combining both LLM and rule-based approaches for optimal performance

### Debate Rooms
Dedicated spaces where agents can:
- Present trading strategies
- Debate market conditions
- Negotiate positions
- Coordinate multi-agent actions

### Simulation Engine
Core trading infrastructure including:
- **Orderbook**: Real-time order matching and price discovery
- **Execution Agent**: Handles trade execution, settlement, and order routing

### Smart Contract Integration
Blockchain-based components for:
- Transaction verification
- Immutable trade records
- Decentralized governance
- Transparent market operations

### High-Fidelity UI
Modern, responsive interface providing:
- Real-time market visualization
- Agent monitoring and control
- Trade history and analytics
- Sector performance dashboards

## Project Structure

### `/frontend`
Next.js-based frontend application providing the user interface for interacting with the MAX simulation. Includes components for agent management, market visualization, debate room interfaces, and real-time data display.

### `/backend`
Node.js/Express backend server handling:
- Agent orchestration and coordination
- Market simulation logic
- Orderbook management
- API endpoints for frontend communication
- Integration with blockchain networks

### `/contracts`
Smart contracts written in Solidity for:
- Trade execution and settlement
- Agent registry and verification
- Market governance mechanisms
- Transaction logging and audit trails

### `/shared`
Shared TypeScript code and utilities used across frontend and backend:
- Type definitions and schemas
- Common utility functions
- Shared business logic
- Validation schemas

### `/docs`
Project documentation including:
- Architecture documentation
- API specifications
- Agent development guides
- Deployment instructions

## Development Setup

### Prerequisites

- **Node.js**: v18.x or higher
- **npm**: v9.x or higher (or **pnpm**: v8.x or higher recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd MAX
   ```

2. Install dependencies for all modules:
   ```bash
   # Using pnpm (recommended)
   pnpm install

   # Or using npm
   npm install
   ```

### Starting the Development Environment

#### Frontend

Navigate to the frontend directory and start the development server:

```bash
cd frontend
pnpm dev
# or
npm run dev
```

The frontend will be available at `http://localhost:3000` (or the next available port).

#### Backend

Navigate to the backend directory and start the server:

```bash
cd backend
pnpm dev
# or
npm run dev
```

The backend API will be available at `http://localhost:8000` (or as configured in your environment).

### Recommended Versions

- **Node.js**: 18.x LTS or 20.x LTS
- **npm**: 9.x or higher
- **pnpm**: 8.x or higher (recommended for monorepo management)

## Roadmap

### PHASE 1: Foundation
- Core infrastructure setup
- Basic agent framework
- Simple orderbook implementation
- Initial UI components

### PHASE 2: Agent System
- LLM agent integration
- Rule-based agent engine
- Agent communication protocols
- Basic debate room functionality

### PHASE 3: Market Simulation
- Sector system implementation
- Advanced orderbook mechanics
- Execution engine
- Market data feeds

### PHASE 4: Coordination & Debate
- Full debate room features
- Multi-agent coordination
- Manager agent system
- Strategy negotiation protocols

### PHASE 5: Blockchain Integration
- Smart contract deployment
- On-chain trade execution
- Agent registry on-chain
- Governance mechanisms

### PHASE 6: Production & Scale
- Performance optimization
- Advanced analytics
- Production deployment
- Scaling infrastructure
- Community features

## Contributing

Contributions are welcome! Please refer to the documentation in `/docs` for architecture details and development guidelines.

## License

[License information to be added]
