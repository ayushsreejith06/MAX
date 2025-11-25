#!/usr/bin/env node

/**
 * Test script to verify backend and frontend are working
 * Run this after starting both servers
 */

const http = require('http');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function testBackend() {
  log('\n=== Testing Backend (Port 8000) ===\n', 'cyan');

  try {
    // Test health endpoint
    log('1. Testing /health endpoint...', 'blue');
    const health = await makeRequest('http://localhost:8000/health');
    if (health.statusCode === 200) {
      log('   ✓ Health check passed', 'green');
      log(`   Response: ${health.body}`, 'reset');
    } else {
      log(`   ✗ Health check failed: ${health.statusCode}`, 'red');
    }

    // Test GET sectors
    log('\n2. Testing GET /sectors endpoint...', 'blue');
    const getSectors = await makeRequest('http://localhost:8000/sectors');
    if (getSectors.statusCode === 200) {
      log('   ✓ GET /sectors passed', 'green');
      const data = JSON.parse(getSectors.body);
      log(`   Found ${data.data.length} sectors`, 'reset');
      if (data.data.length > 0) {
        log(`   Sectors: ${data.data.map(s => s.name).join(', ')}`, 'reset');
      }
    } else {
      log(`   ✗ GET /sectors failed: ${getSectors.statusCode}`, 'red');
    }

    // Test POST sectors
    log('\n3. Testing POST /sectors endpoint...', 'blue');
    const testSectorName = `Test-${Date.now()}`;
    const postSectors = await makeRequest('http://localhost:8000/sectors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: testSectorName })
    });
    if (postSectors.statusCode === 201) {
      log('   ✓ POST /sectors passed', 'green');
      const data = JSON.parse(postSectors.body);
      log(`   Created sector: ${data.data.name} (ID: ${data.data.id.slice(0, 8)}...)`, 'reset');
    } else {
      log(`   ✗ POST /sectors failed: ${postSectors.statusCode}`, 'red');
      log(`   Response: ${postSectors.body}`, 'red');
    }

    log('\n✓ Backend tests completed!\n', 'green');
    return true;
  } catch (error) {
    log(`\n✗ Backend test failed: ${error.message}`, 'red');
    log('   Make sure the backend server is running on port 8000', 'yellow');
    return false;
  }
}

async function testFrontend() {
  log('\n=== Testing Frontend (Port 3000) ===\n', 'cyan');

  try {
    log('1. Testing frontend server...', 'blue');
    const frontend = await makeRequest('http://localhost:3000');
    if (frontend.statusCode === 200) {
      log('   ✓ Frontend server is running', 'green');
      log(`   Status: ${frontend.statusCode}`, 'reset');
    } else {
      log(`   ✗ Frontend server returned: ${frontend.statusCode}`, 'red');
    }

    log('\n✓ Frontend tests completed!\n', 'green');
    return true;
  } catch (error) {
    log(`\n✗ Frontend test failed: ${error.message}`, 'red');
    log('   Make sure the frontend server is running on port 3000', 'yellow');
    return false;
  }
}

async function main() {
  log('\n🧪 MAX Phase 1 Server Test Suite\n', 'cyan');
  log('Make sure both servers are running:', 'yellow');
  log('  - Backend:  cd backend && npm start', 'yellow');
  log('  - Frontend: cd frontend && npm run dev\n', 'yellow');

  const backendOk = await testBackend();
  const frontendOk = await testFrontend();

  log('\n=== Summary ===\n', 'cyan');
  if (backendOk && frontendOk) {
    log('✅ All servers are working!', 'green');
    log('\n📝 Next steps:', 'blue');
    log('   1. Open http://localhost:3000 in your browser', 'reset');
    log('   2. Navigate to the Sectors page', 'reset');
    log('   3. Try creating a new sector', 'reset');
    log('   4. Verify it appears in the list', 'reset');
  } else {
    log('❌ Some servers are not working. Check the errors above.', 'red');
  }
  log('');
}

main().catch(console.error);

