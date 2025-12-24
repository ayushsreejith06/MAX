# MNEE Integration Guide for Multi-Agent Trading System

## Table of Contents
1. [Overview](#overview)
2. [Architecture & Security](#architecture--security)
3. [Installation & Setup](#installation--setup)
4. [Wallet Management](#wallet-management)
5. [Executable Item Schema](#executable-item-schema)
6. [Core Operations](#core-operations)
7. [Transaction Execution](#transaction-execution)
8. [Transaction Tracking](#transaction-tracking)
9. [Safety & Validation](#safety--validation)
10. [Error Handling & Retry Logic](#error-handling--retry-logic)
11. [Rebalancing Implementation](#rebalancing-implementation)
12. [Webhook Integration](#webhook-integration)
13. [Complete Examples](#complete-examples)
14. [LLM Agent Integration Patterns](#llm-agent-integration-patterns)

---

## Overview

This guide provides everything needed to integrate MNEE (USD stablecoin on BSV) into a multi-agent trading system where:
- **Multiple agents** generate executable checklist items (buy, sell, rebalance, hold)
- **Manager agents** approve/reject and execute approved items
- **Each manager** has its own HD wallet for isolated operations
- **Transactions** are tracked permanently with full audit trails

### Key Concepts

- **MNEE**: USD stablecoin token on Bitcoin SV blockchain
- **Atomic Units**: 1 MNEE = 100,000 atomic units (5 decimals)
- **UTXO Model**: Each transaction spends previous outputs
- **Cosigner**: MNEE requires cosigner approval for all transfers
- **Ticket ID**: Async transaction identifier for status tracking

---

## Architecture & Security

### Recommended Architecture

For security and efficiency, implement a **service layer** that wraps the MNEE SDK:

```
┌─────────────────┐
│  Manager Agent  │
│  (LLM Agent)    │
└────────┬────────┘
         │
         │ Calls service methods
         ▼
┌─────────────────────────────┐
│  MNEE Service Layer         │
│  - Validation              │
│  - Approval checks         │
│  - Safety limits           │
│  - Error handling          │
└────────┬────────────────────┘
         │
         │ Uses SDK
         ▼
┌─────────────────────────────┐
│  MNEE SDK (@mnee/ts-sdk)   │
└─────────────────────────────┘
```

**Why this architecture?**
- **Security**: Service layer validates all inputs before SDK calls
- **Efficiency**: Centralized rate limiting, caching, and optimization
- **Control**: Approval thresholds and limits enforced consistently
- **LLM-Friendly**: Simple function interface for agents to call

### Security Best Practices

1. **Never expose mnemonics** to agents - only pass through service layer
2. **Validate all addresses** before transactions
3. **Check balances** before every transfer
4. **Implement approval thresholds** at service layer
5. **Log all operations** for audit trails
6. **Use whitelist/blacklist** for address validation

---

## Installation & Setup

### Install Dependencies

```bash
npm install @mnee/ts-sdk
```

### Initialize MNEE SDK

```typescript
import Mnee from '@mnee/ts-sdk';

// Initialize with environment and optional API key
const mnee = new Mnee({
  environment: 'production', // or 'sandbox' for testing
  apiKey: 'your-api-key-here' // Optional but recommended
});
```

### Service Layer Initialization

```typescript
interface ManagerConfig {
  managerId: string;
  managerName: string;
  mnemonic: string; // User-provided at runtime
  limits: SafetyLimits;
  whitelist?: string[];
  blacklist?: string[];
}

interface SafetyLimits {
  minTransactionAmount: number; // In MNEE
  maxTransactionAmount?: number; // Optional, in MNEE
  maxDailySpending?: number; // Optional, in MNEE
  maxBalancePercentage?: number; // Max % of balance per transaction
  timeRestrictions?: {
    enabled: boolean;
    allowedHours?: number[]; // [0-23] hours when transactions allowed
    blockedDays?: number[]; // [0-6] days blocked (0=Sunday)
  };
}

class MneeService {
  private mnee: Mnee;
  private hdWallet: HDWallet;
  private config: ManagerConfig;
  private db: TransactionDatabase; // Your database interface
  
  constructor(config: ManagerConfig) {
    this.mnee = new Mnee({
      environment: config.environment || 'production',
      apiKey: config.apiKey
    });
    
    // Create HD wallet with manager-specific derivation path
    const derivationPath = `m/44'/236'/0'/${this.hashManagerName(config.managerName)}'`;
    this.hdWallet = this.mnee.HDWallet(config.mnemonic, {
      derivationPath,
      cacheSize: 1000
    });
    
    this.config = config;
  }
  
  private hashManagerName(name: string): string {
    // Simple hash to create unique account index
    // Use a proper hash function in production
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString();
  }
}
```

---

## Wallet Management

### HD Wallet Per Manager

Each manager agent gets its own HD wallet with a unique derivation path:

```typescript
// Derivation path format: m/44'/236'/0'/{managerHash}'/0/{index}
// Example: m/44'/236'/0'/12345'/0/0 for manager "Technology"

class WalletManager {
  private hdWallet: HDWallet;
  private managerName: string;
  private receiveIndex: number = 0;
  private changeIndex: number = 0;
  
  constructor(mnee: Mnee, mnemonic: string, managerName: string) {
    const managerHash = this.hashManagerName(managerName);
    const derivationPath = `m/44'/236'/0'/${managerHash}'`;
    
    this.hdWallet = mnee.HDWallet(mnemonic, {
      derivationPath,
      cacheSize: 1000
    });
    this.managerName = managerName;
  }
  
  // Get primary address for this manager (index 0)
  getPrimaryAddress(): AddressInfo {
    return this.hdWallet.deriveAddress(0, false);
  }
  
  // Get next receive address
  getNextReceiveAddress(): AddressInfo {
    const info = this.hdWallet.deriveAddress(this.receiveIndex, false);
    this.receiveIndex++;
    return info;
  }
  
  // Get change address
  getChangeAddress(): AddressInfo {
    const info = this.hdWallet.deriveAddress(this.changeIndex, true);
    this.changeIndex++;
    return info;
  }
  
  // Get WIF for a specific address (on-demand derivation)
  getWifForAddress(address: string): string {
    const result = this.hdWallet.getPrivateKeysForAddresses([address], {
      maxScanReceive: 10000,
      maxScanChange: 10000
    });
    return result.privateKeys[address];
  }
  
  private hashManagerName(name: string): string {
    // Implementation as above
  }
}
```

### Deriving WIF On-Demand

For security, derive private keys only when needed:

```typescript
async executeTransfer(recipients: SendMNEE[]): Promise<TransferResponse> {
  // Get primary address for this manager
  const primaryAddress = this.walletManager.getPrimaryAddress();
  
  // Derive WIF on-demand (not stored)
  const wif = primaryAddress.privateKey;
  
  // Execute transfer
  const response = await this.mnee.transfer(recipients, wif);
  
  // Clear sensitive data from memory (if possible)
  // Note: JavaScript doesn't guarantee memory clearing, but this is best practice
  
  return response;
}
```

---

## Executable Item Schema

### JSON Schema for Checklist Items

```typescript
interface ExecutableItem {
  // Core identification
  orderId: string; // Unique identifier for this order
  timestamp: string; // ISO 8601 timestamp when item was created
  agentId: string; // ID of agent that generated this item
  
  // Action details
  action: 'buy' | 'sell' | 'rebalance' | 'hold';
  actionType: 'mnee_trade' | 'asset_trade' | 'rebalance'; // MNEE-specific or other asset
  
  // Transaction details
  amount: number; // Amount in MNEE (not atomic units)
  recipientAddress?: string; // For buy/transfer actions
  senderAddress?: string; // For sell actions (usually manager's address)
  
  // Rebalancing specifics
  rebalanceDetails?: {
    fromAsset?: string; // e.g., "NVDA"
    toAsset?: string; // e.g., "MSFT"
    fromAmount: number; // Amount to reduce from source
    toAmount: number; // Amount to add to destination
    reasoning: string; // Why this rebalance is needed
  };
  
  // Asset trading (when MNEE is payment method)
  assetTradeDetails?: {
    assetSymbol: string; // e.g., "NVDA", "MSFT"
    assetAmount?: number; // Amount of asset to buy/sell
    assetPrice?: number; // Price per unit in MNEE
    exchangeAddress?: string; // Address to send MNEE for asset purchase
  };
  
  // Metadata for tracking
  metadata: {
    sector?: string; // Sector name (e.g., "Technology")
    priority?: 'low' | 'medium' | 'high';
    expectedOutcome?: string; // Description of expected result
    relatedOrderIds?: string[]; // Links to related orders
  };
  
  // Status tracking
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  approvalTimestamp?: string;
  executionTimestamp?: string;
  completionTimestamp?: string;
  rejectionReason?: string;
  failureReason?: string;
  
  // Transaction tracking
  ticketId?: string; // MNEE transaction ticket ID
  txId?: string; // Blockchain transaction ID
  retryCount?: number; // Number of retry attempts
}
```

### Example Executable Items

```json
// Example 1: Buy MNEE tokens
{
  "orderId": "ORD-2024-001",
  "timestamp": "2024-01-15T10:30:00Z",
  "agentId": "agent-mnee-001",
  "action": "buy",
  "actionType": "mnee_trade",
  "amount": 1000.0,
  "recipientAddress": "1ManagerPrimaryAddress...",
  "metadata": {
    "sector": "Technology",
    "priority": "high"
  },
  "status": "pending"
}

// Example 2: Sell MNEE (transfer to exchange)
{
  "orderId": "ORD-2024-002",
  "timestamp": "2024-01-15T10:35:00Z",
  "agentId": "agent-asset-001",
  "action": "sell",
  "actionType": "asset_trade",
  "amount": 500.0,
  "recipientAddress": "1ExchangeAddress...",
  "assetTradeDetails": {
    "assetSymbol": "NVDA",
    "assetAmount": 10,
    "assetPrice": 50.0
  },
  "metadata": {
    "sector": "Technology",
    "priority": "medium"
  },
  "status": "pending"
}

// Example 3: Rebalance portfolio
{
  "orderId": "ORD-2024-003",
  "timestamp": "2024-01-15T10:40:00Z",
  "agentId": "agent-rebalance-001",
  "action": "rebalance",
  "actionType": "rebalance",
  "amount": 200.0,
  "rebalanceDetails": {
    "fromAsset": "NVDA",
    "toAsset": "MSFT",
    "fromAmount": 200.0,
    "toAmount": 200.0,
    "reasoning": "MSFT shows stronger growth potential based on recent earnings and AI integration progress"
  },
  "metadata": {
    "sector": "Technology",
    "priority": "high",
    "expectedOutcome": "Reduce NVDA allocation by 200 MNEE, increase MSFT allocation by 200 MNEE"
  },
  "status": "pending"
}

// Example 4: Hold (no transaction, just tracking)
{
  "orderId": "ORD-2024-004",
  "timestamp": "2024-01-15T10:45:00Z",
  "agentId": "agent-hold-001",
  "action": "hold",
  "actionType": "asset_trade",
  "amount": 0,
  "metadata": {
    "sector": "Technology",
    "priority": "low",
    "expectedOutcome": "Maintain current position, no action needed"
  },
  "status": "completed"
}
```

---

## Core Operations

### 1. Check Balance

```typescript
// Single address
async getBalance(address: string): Promise<MNEEBalance> {
  const balance = await this.mnee.balance(address);
  return balance; // { address, amount (atomic), decimalAmount (MNEE) }
}

// Multiple addresses (more efficient)
async getBalances(addresses: string[]): Promise<MNEEBalance[]> {
  const balances = await this.mnee.balances(addresses);
  return balances;
}

// Get manager's total balance
async getManagerBalance(): Promise<number> {
  const primaryAddress = this.walletManager.getPrimaryAddress();
  const balance = await this.mnee.balance(primaryAddress.address);
  return balance.decimalAmount; // Returns MNEE amount
}
```

### 2. Get UTXOs

```typescript
// Get UTXOs for an address
async getUtxos(address: string, page = 0, size = 100): Promise<MNEEUtxo[]> {
  return await this.mnee.getUtxos(address, page, size);
}

// Get enough UTXOs to cover an amount
async getEnoughUtxos(address: string, amountMNEE: number): Promise<MNEEUtxo[]> {
  const atomicAmount = this.mnee.toAtomicAmount(amountMNEE);
  return await this.mnee.getEnoughUtxos(address, atomicAmount);
}

// Get all UTXOs (use with caution for large wallets)
async getAllUtxos(address: string): Promise<MNEEUtxo[]> {
  return await this.mnee.getAllUtxos(address);
}
```

### 3. Unit Conversion

```typescript
// Convert MNEE to atomic units
const atomic = this.mnee.toAtomicAmount(1.5); // Returns: 150000

// Convert atomic units to MNEE
const mnee = this.mnee.fromAtomicAmount(150000); // Returns: 1.5
```

---

## Transaction Execution

### Simple Transfer (Buy/Send)

```typescript
async executeBuy(item: ExecutableItem): Promise<ExecutionResult> {
  // 1. Validate item
  if (!this.validateExecutableItem(item)) {
    throw new Error('Invalid executable item');
  }
  
  // 2. Check balance
  const primaryAddress = this.walletManager.getPrimaryAddress();
  const balance = await this.mnee.balance(primaryAddress.address);
  
  if (balance.decimalAmount < item.amount) {
    throw new Error(`Insufficient balance: ${balance.decimalAmount} < ${item.amount}`);
  }
  
  // 3. Check safety limits
  if (!this.checkSafetyLimits(item)) {
    throw new Error('Transaction exceeds safety limits');
  }
  
  // 4. Validate addresses
  if (!this.validateAddress(item.recipientAddress!)) {
    throw new Error('Invalid or blacklisted recipient address');
  }
  
  // 5. Create transfer request
  const recipients: SendMNEE[] = [{
    address: item.recipientAddress!,
    amount: item.amount
  }];
  
  // 6. Get WIF on-demand
  const wif = primaryAddress.privateKey;
  
  // 7. Execute transfer (fire-and-forget)
  const response = await this.mnee.transfer(recipients, wif, {
    broadcast: true,
    callbackUrl: this.getWebhookUrl(item.orderId)
  });
  
  // 8. Store transaction state
  await this.db.saveTransaction({
    orderId: item.orderId,
    ticketId: response.ticketId,
    status: 'BROADCASTING',
    amount: item.amount,
    recipientAddress: item.recipientAddress!,
    timestamp: new Date().toISOString(),
    rawTx: null, // Will be populated when status updates
    retryCount: 0
  });
  
  return {
    success: true,
    ticketId: response.ticketId,
    orderId: item.orderId
  };
}
```

### Multi-Source Transfer (Rebalancing)

For rebalancing that requires consolidating from multiple addresses:

```typescript
async executeRebalance(item: ExecutableItem): Promise<ExecutionResult> {
  // 1. Validate rebalance details
  if (!item.rebalanceDetails) {
    throw new Error('Rebalance details missing');
  }
  
  // 2. Get source and destination addresses from external system
  const fromAddress = await this.getAssetAddress(item.rebalanceDetails.fromAsset!);
  const toAddress = await this.getAssetAddress(item.rebalanceDetails.toAsset!);
  
  // 3. Check source balance
  const sourceBalance = await this.mnee.balance(fromAddress);
  if (sourceBalance.decimalAmount < item.rebalanceDetails.fromAmount) {
    throw new Error(`Insufficient balance in ${item.rebalanceDetails.fromAsset}`);
  }
  
  // 4. Get UTXOs from source address
  const utxos = await this.mnee.getEnoughUtxos(
    fromAddress,
    item.rebalanceDetails.fromAmount
  );
  
  // 5. Get WIF for source address
  const sourceWif = this.walletManager.getWifForAddress(fromAddress);
  
  // 6. Prepare inputs
  const inputs = utxos.map(utxo => ({
    txid: utxo.outpoint.split(':')[0],
    vout: parseInt(utxo.outpoint.split(':')[1]),
    wif: sourceWif
  }));
  
  // 7. Prepare recipients
  const recipients: SendMNEE[] = [{
    address: toAddress,
    amount: item.rebalanceDetails.toAmount
  }];
  
  // 8. Get change address
  const changeAddress = this.walletManager.getChangeAddress();
  
  // 9. Execute multi-source transfer
  const response = await this.mnee.transferMulti({
    inputs,
    recipients,
    changeAddress: changeAddress.address
  }, {
    broadcast: true,
    callbackUrl: this.getWebhookUrl(item.orderId)
  });
  
  // 10. Store transaction
  await this.db.saveTransaction({
    orderId: item.orderId,
    ticketId: response.ticketId,
    status: 'BROADCASTING',
    amount: item.rebalanceDetails.toAmount,
    recipientAddress: toAddress,
    senderAddress: fromAddress,
    rebalanceDetails: item.rebalanceDetails,
    timestamp: new Date().toISOString(),
    retryCount: 0
  });
  
  return {
    success: true,
    ticketId: response.ticketId,
    orderId: item.orderId
  };
}
```

### Hold Action (No Transaction)

```typescript
async executeHold(item: ExecutableItem): Promise<ExecutionResult> {
  // Hold actions don't require transactions
  // Just update status and log
  
  await this.db.saveTransaction({
    orderId: item.orderId,
    ticketId: null,
    status: 'COMPLETED',
    amount: 0,
    timestamp: new Date().toISOString(),
    notes: 'Hold action - no transaction required'
  });
  
  return {
    success: true,
    orderId: item.orderId,
    ticketId: null
  };
}
```

---

## Transaction Tracking

### Database Schema

```typescript
interface TransactionRecord {
  // Primary keys
  id: string; // Auto-generated UUID
  orderId: string; // From executable item
  ticketId?: string; // MNEE ticket ID
  
  // Transaction details
  txId?: string; // Blockchain transaction ID (available after SUCCESS)
  status: 'BROADCASTING' | 'SUCCESS' | 'MINED' | 'FAILED' | 'COMPLETED';
  amount: number; // In MNEE
  recipientAddress?: string;
  senderAddress?: string;
  
  // Rebalancing details
  rebalanceDetails?: {
    fromAsset: string;
    toAsset: string;
    fromAmount: number;
    toAmount: number;
    reasoning: string;
  };
  
  // Raw transaction data
  rawTx?: string; // Transaction hex
  parsedTx?: ParseTxResponse; // Parsed transaction details
  
  // Error tracking
  errors?: string;
  retryCount: number;
  lastRetryAt?: string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  
  // Metadata
  agentId: string;
  sector?: string;
  metadata?: Record<string, any>;
}
```

### Status Polling

```typescript
class TransactionTracker {
  private mnee: Mnee;
  private db: TransactionDatabase;
  private pollingInterval: NodeJS.Timeout | null = null;
  
  constructor(mnee: Mnee, db: TransactionDatabase) {
    this.mnee = mnee;
    this.db = db;
  }
  
  // Start polling for pending transactions
  startPolling(intervalMs = 5000) {
    if (this.pollingInterval) return;
    
    this.pollingInterval = setInterval(async () => {
      await this.pollPendingTransactions();
    }, intervalMs);
  }
  
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
  
  private async pollPendingTransactions() {
    // Get all transactions in BROADCASTING or SUCCESS status
    const pending = await this.db.getPendingTransactions();
    
    for (const tx of pending) {
      if (!tx.ticketId) continue;
      
      try {
        const status = await this.mnee.getTxStatus(tx.ticketId);
        
        // Update database
        await this.db.updateTransaction(tx.id, {
          status: status.status,
          txId: status.tx_id,
          rawTx: status.tx_hex,
          errors: status.errors,
          updatedAt: new Date().toISOString()
        });
        
        // If transaction completed or failed, parse it
        if (status.status === 'SUCCESS' || status.status === 'MINED') {
          try {
            const parsed = await this.mnee.parseTx(status.tx_id);
            await this.db.updateTransaction(tx.id, {
              parsedTx: parsed,
              completedAt: new Date().toISOString()
            });
          } catch (parseError) {
            console.error(`Failed to parse tx ${status.tx_id}:`, parseError);
          }
        }
        
        // Handle failures with retry logic
        if (status.status === 'FAILED' && tx.retryCount < 3) {
          await this.handleFailedTransaction(tx, status.errors);
        }
        
      } catch (error) {
        console.error(`Error polling ticket ${tx.ticketId}:`, error);
      }
    }
  }
}
```

---

## Safety & Validation

### Safety Limits Check

```typescript
class SafetyValidator {
  private limits: SafetyLimits;
  private whitelist: Set<string>;
  private blacklist: Set<string>;
  private dailySpending: Map<string, number>; // date -> amount
  
  constructor(limits: SafetyLimits, whitelist: string[] = [], blacklist: string[] = []) {
    this.limits = limits;
    this.whitelist = new Set(whitelist);
    this.blacklist = new Set(blacklist);
    this.dailySpending = new Map();
  }
  
  async validateTransaction(item: ExecutableItem, currentBalance: number): Promise<ValidationResult> {
    const errors: string[] = [];
    
    // 1. Minimum amount check
    if (item.amount < this.limits.minTransactionAmount) {
      errors.push(`Amount ${item.amount} below minimum ${this.limits.minTransactionAmount} MNEE`);
    }
    
    // 2. Maximum amount check
    if (this.limits.maxTransactionAmount && item.amount > this.limits.maxTransactionAmount) {
      errors.push(`Amount ${item.amount} exceeds maximum ${this.limits.maxTransactionAmount} MNEE`);
    }
    
    // 3. Balance percentage check
    if (this.limits.maxBalancePercentage) {
      const maxAllowed = currentBalance * (this.limits.maxBalancePercentage / 100);
      if (item.amount > maxAllowed) {
        errors.push(`Amount exceeds ${this.limits.maxBalancePercentage}% of balance`);
      }
    }
    
    // 4. Daily spending limit
    if (this.limits.maxDailySpending) {
      const today = new Date().toISOString().split('T')[0];
      const spentToday = this.dailySpending.get(today) || 0;
      if (spentToday + item.amount > this.limits.maxDailySpending) {
        errors.push(`Daily spending limit would be exceeded`);
      }
    }
    
    // 5. Address validation
    if (item.recipientAddress) {
      if (this.blacklist.has(item.recipientAddress)) {
        errors.push('Recipient address is blacklisted');
      }
      if (this.whitelist.size > 0 && !this.whitelist.has(item.recipientAddress)) {
        errors.push('Recipient address not in whitelist');
      }
    }
    
    // 6. Time restrictions
    if (this.limits.timeRestrictions?.enabled) {
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay();
      
      if (this.limits.timeRestrictions.allowedHours && 
          !this.limits.timeRestrictions.allowedHours.includes(hour)) {
        errors.push(`Transactions not allowed at hour ${hour}`);
      }
      
      if (this.limits.timeRestrictions.blockedDays?.includes(day)) {
        errors.push(`Transactions blocked on day ${day}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  recordSpending(amount: number) {
    const today = new Date().toISOString().split('T')[0];
    const current = this.dailySpending.get(today) || 0;
    this.dailySpending.set(today, current + amount);
  }
  
  resetDailySpending() {
    // Call this at start of each day
    this.dailySpending.clear();
  }
}
```

### Transaction Validation

```typescript
async validateBeforeBroadcast(item: ExecutableItem, rawTx: string): Promise<boolean> {
  // Validate transaction structure
  const recipients: SendMNEE[] = [{
    address: item.recipientAddress!,
    amount: item.amount
  }];
  
  const isValid = await this.mnee.validateMneeTx(rawTx, recipients);
  
  if (!isValid) {
    console.error('Transaction validation failed');
    return false;
  }
  
  // Parse and verify transaction details
  const parsed = await this.mnee.parseTxFromRawTx(rawTx);
  
  // Verify amounts match
  const expectedOutput = recipients.find(r => r.address === item.recipientAddress);
  const actualOutput = parsed.outputs.find(o => o.address === item.recipientAddress);
  
  if (!actualOutput || Math.abs(actualOutput.amount - expectedOutput!.amount) > 0.00001) {
    console.error('Output amount mismatch');
    return false;
  }
  
  return true;
}
```

---

## Error Handling & Retry Logic

### Retry Strategy

```typescript
interface RetryableError {
  isRetryable: boolean;
  reason: string;
  shouldRetry: boolean;
}

class RetryManager {
  private maxRetries = 3;
  
  isRetryableError(error: Error, txStatus?: TransferStatus): RetryableError {
    const errorMessage = error.message.toLowerCase();
    const statusErrors = txStatus?.errors?.toLowerCase() || '';
    
    // Network/timeout errors - retry
    if (errorMessage.includes('timeout') || 
        errorMessage.includes('network') ||
        errorMessage.includes('fetch failed')) {
      return {
        isRetryable: true,
        reason: 'Network error',
        shouldRetry: true
      };
    }
    
    // Temporary API errors (5xx) - retry
    if (errorMessage.includes('500') ||
        errorMessage.includes('502') ||
        errorMessage.includes('503') ||
        errorMessage.includes('504')) {
      return {
        isRetryable: true,
        reason: 'Temporary server error',
        shouldRetry: true
      };
    }
    
    // Transaction not yet mined - retry
    if (statusErrors.includes('not mined') ||
        statusErrors.includes('pending')) {
      return {
        isRetryable: true,
        reason: 'Transaction pending',
        shouldRetry: true
      };
    }
    
    // Insufficient balance - don't retry
    if (errorMessage.includes('insufficient') ||
        errorMessage.includes('balance')) {
      return {
        isRetryable: false,
        reason: 'Insufficient balance',
        shouldRetry: false
      };
    }
    
    // Invalid address - don't retry
    if (errorMessage.includes('invalid address') ||
        errorMessage.includes('blacklisted')) {
      return {
        isRetryable: false,
        reason: 'Invalid address',
        shouldRetry: false
      };
    }
    
    // Default: retry for unknown errors
    return {
      isRetryable: true,
      reason: 'Unknown error',
      shouldRetry: true
    };
  }
  
  async retryTransaction(
    tx: TransactionRecord,
    executeFn: (item: ExecutableItem) => Promise<ExecutionResult>
  ): Promise<ExecutionResult> {
    if (tx.retryCount >= this.maxRetries) {
      throw new Error(`Max retries (${this.maxRetries}) exceeded`);
    }
    
    // Exponential backoff
    const delayMs = Math.pow(2, tx.retryCount) * 1000; // 1s, 2s, 4s
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    // Reconstruct executable item from transaction record
    const item = this.reconstructItemFromTransaction(tx);
    
    // Retry execution
    const result = await executeFn(item);
    
    // Update retry count
    await this.db.updateTransaction(tx.id, {
      retryCount: tx.retryCount + 1,
      lastRetryAt: new Date().toISOString()
    });
    
    return result;
  }
  
  private reconstructItemFromTransaction(tx: TransactionRecord): ExecutableItem {
    // Reconstruct the executable item from stored transaction data
    return {
      orderId: tx.orderId,
      timestamp: tx.createdAt,
      agentId: tx.agentId,
      action: this.inferActionFromTransaction(tx),
      actionType: tx.rebalanceDetails ? 'rebalance' : 'mnee_trade',
      amount: tx.amount,
      recipientAddress: tx.recipientAddress,
      senderAddress: tx.senderAddress,
      rebalanceDetails: tx.rebalanceDetails,
      metadata: tx.metadata || {},
      status: 'executing',
      ticketId: tx.ticketId,
      retryCount: tx.retryCount
    };
  }
  
  private inferActionFromTransaction(tx: TransactionRecord): 'buy' | 'sell' | 'rebalance' | 'hold' {
    if (tx.rebalanceDetails) return 'rebalance';
    if (tx.amount === 0) return 'hold';
    // Could add more logic based on addresses, etc.
    return 'buy';
  }
}
```

### Handling Failed Transactions

```typescript
async handleFailedTransaction(tx: TransactionRecord, errorMessage: string) {
  const retryManager = new RetryManager();
  const retryable = retryManager.isRetryableError(new Error(errorMessage));
  
  if (retryable.shouldRetry && tx.retryCount < 3) {
    // Attempt retry
    try {
      const result = await retryManager.retryTransaction(tx, this.executeTransfer.bind(this));
      console.log(`Retry successful for order ${tx.orderId}`);
    } catch (retryError) {
      // Retry failed, mark as failed
      await this.db.updateTransaction(tx.id, {
        status: 'FAILED',
        errors: `Retry failed: ${retryError.message}. Original: ${errorMessage}`,
        completedAt: new Date().toISOString()
      });
    }
  } else {
    // Don't retry, mark as failed
    await this.db.updateTransaction(tx.id, {
      status: 'FAILED',
      errors: errorMessage,
      failureReason: retryable.reason,
      completedAt: new Date().toISOString()
    });
  }
}
```

---

## Rebalancing Implementation

### Complete Rebalancing Flow

```typescript
async executeRebalance(item: ExecutableItem): Promise<ExecutionResult> {
  if (!item.rebalanceDetails) {
    throw new Error('Rebalance details required');
  }
  
  const { fromAsset, toAsset, fromAmount, toAmount, reasoning } = item.rebalanceDetails;
  
  // 1. Get asset addresses from external system
  const fromAddress = await this.externalSystem.getAssetAddress(fromAsset);
  const toAddress = await this.externalSystem.getAssetAddress(toAsset);
  
  if (!fromAddress || !toAddress) {
    throw new Error(`Asset addresses not found for ${fromAsset} or ${toAsset}`);
  }
  
  // 2. Check source balance
  const sourceBalance = await this.mnee.balance(fromAddress);
  if (sourceBalance.decimalAmount < fromAmount) {
    throw new Error(`Insufficient balance: ${sourceBalance.decimalAmount} < ${fromAmount}`);
  }
  
  // 3. Validate rebalance doesn't exceed safety limits
  const maxRebalance = sourceBalance.decimalAmount * 0.5; // Max 50% rebalance
  if (fromAmount > maxRebalance) {
    throw new Error(`Rebalance amount exceeds 50% of source balance`);
  }
  
  // 4. Get UTXOs from source
  const utxos = await this.mnee.getEnoughUtxos(fromAddress, fromAmount);
  
  // 5. Get WIF for source address
  const sourceWif = this.walletManager.getWifForAddress(fromAddress);
  
  // 6. Prepare transfer
  const inputs = utxos.map(utxo => ({
    txid: utxo.outpoint.split(':')[0],
    vout: parseInt(utxo.outpoint.split(':')[1]),
    wif: sourceWif
  }));
  
  const recipients: SendMNEE[] = [{
    address: toAddress,
    amount: toAmount
  }];
  
  const changeAddress = this.walletManager.getChangeAddress();
  
  // 7. Execute transfer
  const response = await this.mnee.transferMulti({
    inputs,
    recipients,
    changeAddress: changeAddress.address
  }, {
    broadcast: true,
    callbackUrl: this.getWebhookUrl(item.orderId)
  });
  
  // 8. Update external system allocations
  await this.externalSystem.updateAllocation(fromAsset, -fromAmount);
  await this.externalSystem.updateAllocation(toAsset, toAmount);
  
  // 9. Store transaction
  await this.db.saveTransaction({
    orderId: item.orderId,
    ticketId: response.ticketId,
    status: 'BROADCASTING',
    amount: toAmount,
    recipientAddress: toAddress,
    senderAddress: fromAddress,
    rebalanceDetails: item.rebalanceDetails,
    timestamp: new Date().toISOString(),
    retryCount: 0
  });
  
  return {
    success: true,
    ticketId: response.ticketId,
    orderId: item.orderId
  };
}
```

---

## Webhook Integration

### Webhook Endpoint

```typescript
// Express.js example
app.post('/webhook/mnee/:orderId', async (req, res) => {
  const { orderId } = req.params;
  const webhookData: TransferWebhookResponse = req.body;
  
  try {
    // Update transaction in database
    await db.updateTransactionByOrderId(orderId, {
      status: webhookData.status,
      txId: webhookData.tx_id,
      rawTx: webhookData.tx_hex,
      errors: webhookData.errors,
      updatedAt: webhookData.updatedAt
    });
    
    // Notify manager agent of status change
    await notifyManagerAgent(orderId, webhookData.status);
    
    // If completed, parse transaction
    if (webhookData.status === 'SUCCESS' || webhookData.status === 'MINED') {
      const parsed = await mnee.parseTx(webhookData.tx_id);
      await db.updateTransactionByOrderId(orderId, {
        parsedTx: parsed,
        completedAt: new Date().toISOString()
      });
    }
    
    // If failed, handle retry
    if (webhookData.status === 'FAILED') {
      const tx = await db.getTransactionByOrderId(orderId);
      await handleFailedTransaction(tx, webhookData.errors || 'Unknown error');
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

function getWebhookUrl(orderId: string): string {
  return `https://your-domain.com/webhook/mnee/${orderId}`;
}
```

---

## Complete Examples

### Example: Manager Agent Service

```typescript
class ManagerMneeService {
  private mnee: Mnee;
  private walletManager: WalletManager;
  private safetyValidator: SafetyValidator;
  private transactionTracker: TransactionTracker;
  private retryManager: RetryManager;
  private db: TransactionDatabase;
  private config: ManagerConfig;
  
  constructor(config: ManagerConfig) {
    this.config = config;
    this.mnee = new Mnee({
      environment: config.environment || 'production',
      apiKey: config.apiKey
    });
    
    this.walletManager = new WalletManager(
      this.mnee,
      config.mnemonic,
      config.managerName
    );
    
    this.safetyValidator = new SafetyValidator(
      config.limits,
      config.whitelist || [],
      config.blacklist || []
    );
    
    this.transactionTracker = new TransactionTracker(this.mnee, this.db);
    this.retryManager = new RetryManager();
    this.db = new TransactionDatabase(); // Your implementation
  }
  
  // Main execution method for manager agents
  async executeItem(item: ExecutableItem): Promise<ExecutionResult> {
    try {
      // 1. Validate item structure
      if (!this.validateItemStructure(item)) {
        throw new Error('Invalid item structure');
      }
      
      // 2. Check balance
      const balance = await this.getManagerBalance();
      
      // 3. Validate safety limits
      const validation = await this.safetyValidator.validateTransaction(item, balance);
      if (!validation.valid) {
        throw new Error(`Safety validation failed: ${validation.errors.join(', ')}`);
      }
      
      // 4. Execute based on action type
      let result: ExecutionResult;
      
      switch (item.action) {
        case 'buy':
          result = await this.executeBuy(item);
          break;
        case 'sell':
          result = await this.executeSell(item);
          break;
        case 'rebalance':
          result = await this.executeRebalance(item);
          break;
        case 'hold':
          result = await this.executeHold(item);
          break;
        default:
          throw new Error(`Unknown action: ${item.action}`);
      }
      
      // 5. Record spending for daily limits
      if (item.amount > 0) {
        this.safetyValidator.recordSpending(item.amount);
      }
      
      return result;
      
    } catch (error) {
      // Log error and update item status
      await this.db.saveTransaction({
        orderId: item.orderId,
        status: 'FAILED',
        errors: error.message,
        failureReason: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }
  
  // Get transaction status (for polling)
  async getTransactionStatus(orderId: string): Promise<TransactionStatus> {
    const tx = await this.db.getTransactionByOrderId(orderId);
    
    if (!tx) {
      throw new Error('Transaction not found');
    }
    
    // If we have a ticket ID, get latest status from MNEE
    if (tx.ticketId && tx.status !== 'COMPLETED' && tx.status !== 'FAILED') {
      try {
        const status = await this.mnee.getTxStatus(tx.ticketId);
        
        // Update database
        await this.db.updateTransaction(tx.id, {
          status: status.status,
          txId: status.tx_id,
          rawTx: status.tx_hex,
          errors: status.errors,
          updatedAt: status.updatedAt
        });
        
        return {
          orderId: tx.orderId,
          ticketId: tx.ticketId,
          txId: status.tx_id,
          status: status.status,
          amount: tx.amount,
          recipientAddress: tx.recipientAddress,
          errors: status.errors,
          retryCount: tx.retryCount
        };
      } catch (error) {
        console.error(`Error getting status for ${tx.ticketId}:`, error);
      }
    }
    
    return {
      orderId: tx.orderId,
      ticketId: tx.ticketId,
      txId: tx.txId,
      status: tx.status,
      amount: tx.amount,
      recipientAddress: tx.recipientAddress,
      errors: tx.errors,
      retryCount: tx.retryCount
    };
  }
  
  // Start background services
  startServices() {
    this.transactionTracker.startPolling(5000); // Poll every 5 seconds
  }
  
  stopServices() {
    this.transactionTracker.stopPolling();
  }
}
```

---

## LLM Agent Integration Patterns

### Function Calling Interface for Agents

```typescript
// Define functions that agents can call
const mneeFunctions = [
  {
    name: 'execute_mnee_transaction',
    description: 'Execute a MNEE transaction (buy, sell, rebalance, or hold) based on an approved executable item',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Unique order identifier' },
        action: { 
          type: 'string', 
          enum: ['buy', 'sell', 'rebalance', 'hold'],
          description: 'Action to execute'
        },
        amount: { 
          type: 'number', 
          description: 'Amount in MNEE (not atomic units)' 
        },
        recipientAddress: { 
          type: 'string', 
          description: 'Recipient Bitcoin address (required for buy/sell)' 
        },
        rebalanceDetails: {
          type: 'object',
          description: 'Rebalancing details (required for rebalance action)',
          properties: {
            fromAsset: { type: 'string' },
            toAsset: { type: 'string' },
            fromAmount: { type: 'number' },
            toAmount: { type: 'number' },
            reasoning: { type: 'string' }
          }
        }
      },
      required: ['orderId', 'action', 'amount']
    }
  },
  {
    name: 'get_transaction_status',
    description: 'Get the current status of a transaction by order ID',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID to check' }
      },
      required: ['orderId']
    }
  },
  {
    name: 'get_manager_balance',
    description: 'Get the current MNEE balance for this manager',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'check_safety_limits',
    description: 'Check if a transaction would pass safety limits without executing',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        recipientAddress: { type: 'string' }
      },
      required: ['amount']
    }
  }
];

// Implementation
async function handleAgentFunctionCall(functionName: string, args: any): Promise<any> {
  const service = getManagerService(); // Get service for current manager
  
  switch (functionName) {
    case 'execute_mnee_transaction':
      const item: ExecutableItem = {
        orderId: args.orderId,
        timestamp: new Date().toISOString(),
        agentId: getCurrentAgentId(),
        action: args.action,
        actionType: args.action === 'rebalance' ? 'rebalance' : 'mnee_trade',
        amount: args.amount,
        recipientAddress: args.recipientAddress,
        rebalanceDetails: args.rebalanceDetails,
        metadata: {},
        status: 'approved'
      };
      return await service.executeItem(item);
      
    case 'get_transaction_status':
      return await service.getTransactionStatus(args.orderId);
      
    case 'get_manager_balance':
      return { balance: await service.getManagerBalance() };
      
    case 'check_safety_limits':
      const balance = await service.getManagerBalance();
      const item = {
        orderId: 'check-' + Date.now(),
        timestamp: new Date().toISOString(),
        agentId: getCurrentAgentId(),
        action: 'buy' as const,
        actionType: 'mnee_trade' as const,
        amount: args.amount,
        recipientAddress: args.recipientAddress,
        metadata: {},
        status: 'pending' as const
      };
      const validation = await service.safetyValidator.validateTransaction(item, balance);
      return {
        valid: validation.valid,
        errors: validation.errors
      };
      
    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}
```

### Agent Prompt Template

```typescript
const agentSystemPrompt = `
You are a manager agent responsible for executing MNEE transactions.

Available Functions:
1. execute_mnee_transaction(orderId, action, amount, recipientAddress?, rebalanceDetails?)
   - Execute a transaction for an approved checklist item
   - Actions: buy, sell, rebalance, hold
   - Always check balance first using get_manager_balance()
   - Validate addresses before executing

2. get_transaction_status(orderId)
   - Check status of a previously executed transaction
   - Returns: status, txId, ticketId, errors

3. get_manager_balance()
   - Get current MNEE balance for this manager

4. check_safety_limits(amount, recipientAddress?)
   - Pre-validate a transaction before execution

Execution Flow:
1. Receive approved checklist items from agents
2. For each item:
   a. Check current balance
   b. Validate safety limits
   c. Execute transaction (fire-and-forget)
   d. Store ticket ID for tracking
3. Poll transaction status periodically
4. Handle retries for retryable errors (max 3 attempts)
5. Report final status back to agents

Error Handling:
- Network errors: Retry up to 3 times with exponential backoff
- Insufficient balance: Reject immediately, don't retry
- Invalid addresses: Reject immediately, don't retry
- Always provide clear failure reasons

Transaction States:
- BROADCASTING: Transaction submitted, waiting for network
- SUCCESS: Transaction accepted by network
- MINED: Transaction confirmed in block
- FAILED: Transaction failed (check errors field)
`;

// Example agent interaction
async function processApprovedItems(approvedItems: ExecutableItem[]) {
  const service = getManagerService();
  
  for (const item of approvedItems) {
    try {
      // Agent checks balance first
      const balance = await service.getManagerBalance();
      console.log(`Current balance: ${balance} MNEE`);
      
      // Agent validates limits
      const validation = await service.checkSafetyLimits(item.amount, item.recipientAddress);
      if (!validation.valid) {
        console.log(`Item ${item.orderId} rejected: ${validation.errors.join(', ')}`);
        continue;
      }
      
      // Agent executes
      const result = await service.executeItem(item);
      console.log(`Item ${item.orderId} executed, ticket: ${result.ticketId}`);
      
      // Agent starts polling (fire-and-forget)
      pollTransactionStatus(item.orderId);
      
    } catch (error) {
      console.error(`Failed to execute ${item.orderId}:`, error.message);
    }
  }
}

async function pollTransactionStatus(orderId: string) {
  const service = getManagerService();
  
  const interval = setInterval(async () => {
    const status = await service.getTransactionStatus(orderId);
    
    console.log(`Order ${orderId} status: ${status.status}`);
    
    if (['SUCCESS', 'MINED', 'FAILED'].includes(status.status)) {
      clearInterval(interval);
      
      if (status.status === 'FAILED') {
        console.error(`Order ${orderId} failed: ${status.errors}`);
        // Notify agents of failure
      } else {
        console.log(`Order ${orderId} completed: ${status.txId}`);
        // Notify agents of success
      }
    }
  }, 5000); // Poll every 5 seconds
}
```

---

## Quick Reference

### Common Operations

```typescript
// Initialize
const mnee = new Mnee({ environment: 'production', apiKey: 'key' });
const hdWallet = mnee.HDWallet(mnemonic, { derivationPath: "m/44'/236'/0'/0'" });

// Check balance
const balance = await mnee.balance(address); // Returns: { address, amount (atomic), decimalAmount (MNEE) }

// Transfer
const response = await mnee.transfer([{ address, amount }], wif, { broadcast: true, callbackUrl });

// Get status
const status = await mnee.getTxStatus(ticketId); // Returns: { status, tx_id, tx_hex, errors }

// Unit conversion
const atomic = mnee.toAtomicAmount(1.5); // 150000
const mnee = mnee.fromAtomicAmount(150000); // 1.5
```

### Status Values

- `BROADCASTING`: Transaction submitted, waiting
- `SUCCESS`: Transaction accepted by network
- `MINED`: Transaction confirmed in block
- `FAILED`: Transaction failed (check errors)

### Error Types

- **Retryable**: Network errors, timeouts, 5xx errors, pending transactions
- **Non-retryable**: Insufficient balance, invalid addresses, blacklisted addresses

---

## Best Practices Summary

1. **Always check balance** before executing transactions
2. **Validate addresses** against whitelist/blacklist
3. **Enforce safety limits** at service layer
4. **Use fire-and-forget** with status polling for async operations
5. **Store all transaction data** for audit trails
6. **Implement retry logic** for retryable errors only
7. **Derive WIF on-demand** for security
8. **Use unique derivation paths** per manager
9. **Poll transaction status** regularly until complete
10. **Provide clear error messages** for agent reasoning

---

## Support & Resources

- **MNEE Documentation**: https://docs.mnee.io
- **SDK Repository**: https://github.com/mnee-xyz/mnee
- **API Reference**: See `docs/` directory in SDK

---

*This guide is optimized for LLM agent integration and provides all necessary patterns for implementing MNEE transactions in a multi-agent trading system.*

