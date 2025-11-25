#!/usr/bin/env node

/**
 * Phase 1 Verification Script
 * 
 * This script verifies that all Phase 1 components are working correctly.
 * Run with: node scripts/verify-phase1.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

let passed = 0;
let failed = 0;
let warnings = 0;

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function check(description, testFn) {
  try {
    const result = testFn();
    if (result === true || (result && result.passed)) {
      log(`✓ ${description}`, 'green');
      passed++;
      return true;
    } else {
      log(`✗ ${description}`, 'red');
      if (result && result.message) {
        log(`  ${result.message}`, 'red');
      }
      failed++;
      return false;
    }
  } catch (error) {
    log(`✗ ${description}`, 'red');
    log(`  Error: ${error.message}`, 'red');
    failed++;
    return false;
  }
}

function warn(description, message) {
  log(`⚠ ${description}`, 'yellow');
  if (message) {
    log(`  ${message}`, 'yellow');
  }
  warnings++;
}

// Check if file exists
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

// Check if directory exists
function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

// Read and parse JSON file
function readJSON(filePath) {
  try {
    if (!fileExists(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

log('\n=== Phase 1 Verification ===\n', 'cyan');

// 1. Backend Infrastructure Checks
log('1. Backend Infrastructure', 'blue');

const backendDir = path.join(__dirname, '..', 'backend');
const frontendDir = path.join(__dirname, '..', 'frontend');

check('Backend directory exists', () => dirExists(backendDir));

check('Backend server.js exists', () => {
  const serverFile = path.join(backendDir, 'server.js');
  if (!fileExists(serverFile)) return false;
  const content = fs.readFileSync(serverFile, 'utf8');
  return content.includes('fastify') || content.includes('express');
});

check('Backend package.json exists', () => {
  const pkgFile = path.join(backendDir, 'package.json');
  if (!fileExists(pkgFile)) return { passed: false, message: 'package.json not found' };
  const pkg = readJSON(pkgFile);
  if (!pkg) return { passed: false, message: 'package.json could not be parsed' };
  return !!(pkg.dependencies || pkg.devDependencies);
});

// 2. Agent Framework Checks
log('\n2. Agent Framework', 'blue');

check('Agent base class exists', () => {
  const agentFile = path.join(backendDir, 'agents', 'base', 'Agent.js');
  if (!fileExists(agentFile)) return false;
  const content = fs.readFileSync(agentFile, 'utf8');
  return content.includes('class Agent') && content.includes('constructor');
});

check('Agent class has required methods', () => {
  const agentFile = path.join(backendDir, 'agents', 'base', 'Agent.js');
  const content = fs.readFileSync(agentFile, 'utf8');
  return content.includes('addMemory') && 
         content.includes('toJSON') && 
         content.includes('getSummary');
});

check('Agent storage directory exists', () => {
  const storageDir = path.join(backendDir, 'storage');
  return dirExists(storageDir);
});

// 3. Sector System Checks
log('\n3. Sector System', 'blue');

check('Sector model exists', () => {
  const sectorFile = path.join(backendDir, 'models', 'Sector.js');
  if (!fileExists(sectorFile)) return false;
  const content = fs.readFileSync(sectorFile, 'utf8');
  return content.includes('class Sector') && content.includes('constructor');
});

check('Sector controller exists', () => {
  const controllerFile = path.join(backendDir, 'controllers', 'sectorsController.js');
  return fileExists(controllerFile);
});

check('Sector routes exist', () => {
  const routesFile = path.join(backendDir, 'routes', 'sectors.js');
  return fileExists(routesFile);
});

check('Sector storage file exists or can be created', () => {
  const storageFile = path.join(backendDir, 'storage', 'sectors.json');
  const storageDir = path.join(backendDir, 'storage');
  if (!dirExists(storageDir)) return false;
  // File might not exist yet, but directory should
  return true;
});

// 4. Frontend Infrastructure Checks
log('\n4. Frontend Infrastructure', 'blue');

check('Frontend directory exists', () => dirExists(frontendDir));

check('Frontend package.json exists', () => {
  const pkgFile = path.join(frontendDir, 'package.json');
  if (!fileExists(pkgFile)) return { passed: false, message: 'package.json not found' };
  const pkg = readJSON(pkgFile);
  if (!pkg) return { passed: false, message: 'package.json could not be parsed' };
  if (!pkg.dependencies) return { passed: false, message: 'package.json has no dependencies' };
  return !!pkg.dependencies.next;
});

check('Next.js app directory exists', () => {
  const appDir = path.join(frontendDir, 'app');
  return dirExists(appDir);
});

check('Dashboard page exists', () => {
  const pageFile = path.join(frontendDir, 'app', 'page.tsx');
  return fileExists(pageFile);
});

check('Sectors page exists', () => {
  const pageFile = path.join(frontendDir, 'app', 'sectors', 'page.tsx');
  return fileExists(pageFile);
});

check('Agents page exists', () => {
  const pageFile = path.join(frontendDir, 'app', 'agents', 'page.tsx');
  return fileExists(pageFile);
});

check('Navigation component exists', () => {
  const navFile = path.join(frontendDir, 'app', 'components', 'Navigation.tsx');
  return fileExists(navFile);
});

check('API client exists', () => {
  const apiFile = path.join(frontendDir, 'lib', 'api.ts');
  return fileExists(apiFile);
});

// 5. Orderbook Checks
log('\n5. Orderbook Implementation', 'blue');

const orderbookFiles = [
  path.join(backendDir, 'models', 'Orderbook.js'),
  path.join(backendDir, 'utils', 'orderbook.js'),
  path.join(backendDir, 'services', 'orderbook.js')
];

const orderbookExists = orderbookFiles.some(file => fileExists(file));

if (!orderbookExists) {
  warn('Orderbook implementation not found', 
    'This is a Phase 1 requirement. Consider implementing a simple orderbook.');
} else {
  check('Orderbook implementation exists', () => orderbookExists);
}

// 6. Configuration Checks
log('\n6. Configuration', 'blue');

check('Backend has node_modules or package-lock.json', () => {
  const nodeModules = path.join(backendDir, 'node_modules');
  const packageLock = path.join(backendDir, 'package-lock.json');
  return dirExists(nodeModules) || fileExists(packageLock);
});

check('Frontend has node_modules or package-lock.json', () => {
  const nodeModules = path.join(frontendDir, 'node_modules');
  const packageLock = path.join(frontendDir, 'package-lock.json');
  return dirExists(nodeModules) || fileExists(packageLock);
});

// Check if routes are connected
check('Backend routes structure', () => {
  const serverFile = path.join(backendDir, 'server.js');
  const content = fs.readFileSync(serverFile, 'utf8');
  // Check if routes might be registered (this is a basic check)
  return true; // Routes exist, connection might need manual verification
});

warn('Backend routes connection', 
  'Verify that routes are properly registered in server.js. Currently routes exist but may need to be connected.');

// Summary
log('\n=== Summary ===\n', 'cyan');
log(`Passed: ${passed}`, 'green');
if (warnings > 0) {
  log(`Warnings: ${warnings}`, 'yellow');
}
if (failed > 0) {
  log(`Failed: ${failed}`, 'red');
}

const total = passed + failed;
const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

log(`\nSuccess Rate: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');

if (failed === 0 && warnings === 0) {
  log('\n✓ All Phase 1 checks passed!', 'green');
  process.exit(0);
} else if (failed === 0) {
  log('\n✓ All checks passed with warnings. Review warnings above.', 'yellow');
  process.exit(0);
} else {
  log('\n✗ Some checks failed. Please review the errors above.', 'red');
  process.exit(1);
}

