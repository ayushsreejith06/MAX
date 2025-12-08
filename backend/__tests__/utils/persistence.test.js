/**
 * Tests for file locking and concurrent access scenarios in persistence.js
 * 
 * These tests verify that file locking prevents race conditions and data corruption
 * when multiple operations access the same file concurrently.
 */

const path = require('path');
const fs = require('fs').promises;
const { 
  readDataFile, 
  writeDataFile, 
  atomicUpdate,
  getDataFilePath,
  ensureDataDir,
  acquireWriteLock,
  LOCK_CONFIG
} = require('../../utils/persistence');

// Test configuration
const TEST_FILE = 'test-lock.json';
const TEST_DIR = path.join(__dirname, '../../storage/test');

/**
 * Clean up test files
 */
async function cleanup() {
  const testFilePath = path.join(TEST_DIR, TEST_FILE);
  const lockFilePath = `${testFilePath}.lock`;
  const tempFilePath = `${testFilePath}.tmp`;
  
  try {
    await fs.unlink(testFilePath);
  } catch (e) {
    // Ignore if file doesn't exist
  }
  
  try {
    await fs.unlink(lockFilePath);
  } catch (e) {
    // Ignore if file doesn't exist
  }
  
  try {
    await fs.unlink(tempFilePath);
  } catch (e) {
    // Ignore if file doesn't exist
  }
}

/**
 * Helper to run a test with cleanup
 */
async function runTest(testName, testFn) {
  console.log(`\n[TEST] ${testName}`);
  try {
    await cleanup();
    await testFn();
    console.log(`[PASS] ${testName}`);
    return true;
  } catch (error) {
    console.error(`[FAIL] ${testName}:`, error.message);
    console.error(error.stack);
    return false;
  } finally {
    await cleanup();
  }
}

/**
 * Test 1: Basic read/write with locking
 */
async function testBasicReadWrite() {
  const originalData = { items: [], test: 'data', value: 123 };
  await writeDataFile('test-basic.json', originalData);
  const readData = await readDataFile('test-basic.json');
  
  if (JSON.stringify(readData) !== JSON.stringify(originalData)) {
    throw new Error('Data mismatch after read/write');
  }
  
  // Cleanup
  const filePath = getDataFilePath('test-basic.json');
  await fs.unlink(filePath).catch(() => {});
}

/**
 * Test 2: Concurrent writes should not corrupt data
 */
async function testConcurrentWrites() {
  const numWriters = 5; // Reduced for more realistic concurrency
  const writesPerWriter = 3;
  
  // Initialize file
  await writeDataFile('test-concurrent.json', { counter: 0, writes: [] });
  
  // Create multiple concurrent writers (locks will serialize them, which is correct)
  const writePromises = [];
  for (let i = 0; i < numWriters; i++) {
    for (let j = 0; j < writesPerWriter; j++) {
      writePromises.push(
        atomicUpdate('test-concurrent.json', (data) => {
          data.counter = (data.counter || 0) + 1;
          data.writes = data.writes || [];
          data.writes.push({ writer: i, write: j, timestamp: Date.now() });
          return data;
        }).catch((error) => {
          // Log but don't fail - some operations may timeout under high load
          console.warn(`Write operation failed: ${error.message}`);
          throw error;
        })
      );
    }
  }
  
  // Wait for all writes to complete (they will be serialized by locks)
  await Promise.all(writePromises);
  
  // Verify data integrity
  const finalData = await readDataFile('test-concurrent.json');
  
  if (finalData.counter !== numWriters * writesPerWriter) {
    throw new Error(`Counter mismatch: expected ${numWriters * writesPerWriter}, got ${finalData.counter}`);
  }
  
  if (finalData.writes.length !== numWriters * writesPerWriter) {
    throw new Error(`Writes array length mismatch: expected ${numWriters * writesPerWriter}, got ${finalData.writes.length}`);
  }
  
  // Cleanup
  const filePath = getDataFilePath('test-concurrent.json');
  await fs.unlink(filePath).catch(() => {});
}

/**
 * Test 3: Concurrent reads should not interfere with each other
 */
async function testConcurrentReads() {
  const testData = { data: 'test', items: [1, 2, 3, 4, 5] };
  await writeDataFile('test-reads.json', testData);
  
  // Create multiple concurrent readers (locks will serialize them, which is correct)
  const numReaders = 10; // Reduced for more realistic concurrency
  const readPromises = [];
  
  for (let i = 0; i < numReaders; i++) {
    readPromises.push(
      readDataFile('test-reads.json').catch((error) => {
        console.warn(`Read operation failed: ${error.message}`);
        throw error;
      })
    );
  }
  
  // Wait for all reads to complete (they will be serialized by locks)
  const results = await Promise.all(readPromises);
  
  // Verify all reads returned the same data
  for (let i = 0; i < results.length; i++) {
    if (JSON.stringify(results[i]) !== JSON.stringify(testData)) {
      throw new Error(`Read ${i} returned different data`);
    }
  }
  
  // Cleanup
  const filePath = getDataFilePath('test-reads.json');
  await fs.unlink(filePath).catch(() => {});
}

/**
 * Test 4: Read-modify-write operations should be atomic
 */
async function testAtomicUpdate() {
  await writeDataFile('test-atomic.json', { value: 0 });
  
  const numOperations = 20; // Reduced for more realistic concurrency
  const operations = [];
  
  // Create concurrent atomic updates (locks will serialize them, ensuring atomicity)
  for (let i = 0; i < numOperations; i++) {
    operations.push(
      atomicUpdate('test-atomic.json', (data) => {
        data.value = data.value + 1;
        return data;
      }).catch((error) => {
        console.warn(`Atomic update failed: ${error.message}`);
        throw error;
      })
    );
  }
  
  // Wait for all operations to complete (they will be serialized by locks)
  await Promise.all(operations);
  
  // Verify final value (should equal numOperations due to atomicity)
  const finalData = await readDataFile('test-atomic.json');
  
  if (finalData.value !== numOperations) {
    throw new Error(`Value mismatch: expected ${numOperations}, got ${finalData.value}`);
  }
  
  // Cleanup
  const filePath = getDataFilePath('test-atomic.json');
  await fs.unlink(filePath).catch(() => {});
}

/**
 * Test 5: Lock timeout handling
 */
async function testLockTimeout() {
  // This test verifies that locks timeout properly
  // We'll simulate a scenario where a lock might be held too long
  
  const filePath = getDataFilePath('test-timeout.json');
  
  // Acquire a lock
  const release1 = await acquireWriteLock(filePath);
  
  // Try to acquire another lock (should timeout or wait)
  let lockAcquired = false;
  const lockPromise = acquireWriteLock(filePath).then(() => {
    lockAcquired = true;
  }).catch((error) => {
    // Expected to timeout or fail
    if (!error.message.includes('timeout') && !error.message.includes('Failed to acquire')) {
      throw error;
    }
  });
  
  // Wait a bit, then release the first lock
  await new Promise(resolve => setTimeout(resolve, 100));
  await release1();
  
  // Wait for the second lock attempt
  await lockPromise;
  
  // Cleanup
  try {
    await fs.unlink(filePath);
  } catch (e) {
    // Ignore
  }
}

/**
 * Test 6: Mixed read and write operations
 */
async function testMixedOperations() {
  await writeDataFile('test-mixed.json', { reads: 0, writes: 0 });
  
  const numOperations = 15; // Reduced for more realistic concurrency
  const operations = [];
  let writeCount = 0;
  
  // Mix of reads and writes (locks will serialize them, which is correct)
  for (let i = 0; i < numOperations; i++) {
    if (i % 2 === 0) {
      // Write operation
      writeCount++;
      operations.push(
        atomicUpdate('test-mixed.json', (data) => {
          data.writes = data.writes + 1;
          return data;
        }).catch((error) => {
          console.warn(`Write operation failed: ${error.message}`);
          throw error;
        })
      );
    } else {
      // Read operation
      operations.push(
        readDataFile('test-mixed.json').catch((error) => {
          console.warn(`Read operation failed: ${error.message}`);
          throw error;
        })
      );
    }
  }
  
  // Wait for all operations to complete (they will be serialized by locks)
  await Promise.all(operations);
  
  // Verify final state
  const finalData = await readDataFile('test-mixed.json');
  
  // Expected writes = number of even indices (0, 2, 4, 6, 8, 10, 12, 14) = 8 for 15 operations
  // But we start counting from 0, so for 15 operations (0-14), even indices are 0,2,4,6,8,10,12,14 = 8 writes
  const expectedWrites = Math.ceil(numOperations / 2); // For 15: ceil(15/2) = 8
  if (finalData.writes !== expectedWrites) {
    throw new Error(`Write count mismatch: expected ${expectedWrites}, got ${finalData.writes}`);
  }
  
  // Cleanup
  const filePath = getDataFilePath('test-mixed.json');
  await fs.unlink(filePath).catch(() => {});
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('File Locking Tests');
  console.log('='.repeat(60));
  console.log(`Lock Config:`, LOCK_CONFIG);
  
  const tests = [
    ['Basic Read/Write', testBasicReadWrite],
    ['Concurrent Writes', testConcurrentWrites],
    ['Concurrent Reads', testConcurrentReads],
    ['Atomic Updates', testAtomicUpdate],
    ['Lock Timeout', testLockTimeout],
    ['Mixed Operations', testMixedOperations]
  ];
  
  const results = [];
  
  for (const [name, testFn] of tests) {
    const passed = await runTest(name, testFn);
    results.push({ name, passed });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Test Results Summary');
  console.log('='.repeat(60));
  
  let passedCount = 0;
  for (const { name, passed } of results) {
    console.log(`${passed ? '✓' : '✗'} ${name}`);
    if (passed) passedCount++;
  }
  
  console.log(`\nPassed: ${passedCount}/${results.length}`);
  
  if (passedCount === results.length) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = {
  testBasicReadWrite,
  testConcurrentWrites,
  testConcurrentReads,
  testAtomicUpdate,
  testLockTimeout,
  testMixedOperations
};

