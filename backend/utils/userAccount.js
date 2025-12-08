const { readDataFile, writeDataFile, atomicUpdate } = require('./persistence');

const USER_ACCOUNT_FILE = 'userAccount.json';

/**
 * Get user account data
 * @returns {Promise<Object>} User account object with balance
 */
async function getUserAccount() {
  try {
    const data = await readDataFile(USER_ACCOUNT_FILE);
    if (data && typeof data === 'object' && typeof data.balance === 'number') {
      return data;
    }
    // Return default account if data is invalid
    return { balance: 0 };
  } catch (error) {
    // If file doesn't exist, return default account and create it
    if (error.code === 'ENOENT') {
      const defaultAccount = { balance: 0 };
      await writeDataFile(USER_ACCOUNT_FILE, defaultAccount);
      return defaultAccount;
    }
    throw error;
  }
}

/**
 * Update user account balance
 * @param {number} amount - Amount to add (positive) or subtract (negative)
 * @returns {Promise<Object>} Updated user account object
 */
async function updateBalance(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new Error('Amount must be a valid number');
  }

  const account = await atomicUpdate(USER_ACCOUNT_FILE, (currentAccount) => {
    const currentBalance = (currentAccount && typeof currentAccount.balance === 'number') 
      ? currentAccount.balance 
      : 0;
    
    const newBalance = Math.max(0, currentBalance + amount); // Prevent negative balance
    
    return {
      balance: newBalance,
      lastUpdated: new Date().toISOString()
    };
  });

  return account;
}

/**
 * Get current user balance
 * @returns {Promise<number>} Current balance
 */
async function getBalance() {
  const account = await getUserAccount();
  return account.balance || 0;
}

/**
 * Add funds to user account
 * @param {number} amount - Amount to add
 * @returns {Promise<Object>} Updated user account object
 */
async function addFunds(amount) {
  if (amount < 0) {
    throw new Error('Amount must be positive');
  }
  return await updateBalance(amount);
}

/**
 * Withdraw funds from user account
 * @param {number} amount - Amount to withdraw
 * @returns {Promise<Object>} Updated user account object
 */
async function withdrawFunds(amount) {
  if (amount < 0) {
    throw new Error('Amount must be positive');
  }
  return await updateBalance(-amount);
}

module.exports = {
  getUserAccount,
  getBalance,
  updateBalance,
  addFunds,
  withdrawFunds
};

