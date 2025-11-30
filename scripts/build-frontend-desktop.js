#!/usr/bin/env node

// Build script for desktop frontend
// This ensures cross-platform compatibility for environment variables

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

process.env.NEXT_PUBLIC_MAX_BACKEND_URL = 'http://127.0.0.1:4000';
process.env.NEXT_PUBLIC_DESKTOP_BUILD = 'true';

// Resolve paths relative to this script's location
// This script is in scripts/build-frontend-desktop.js
// So __dirname is scripts/, and we need to go up one level to project root
const projectRoot = path.resolve(__dirname, '..');
const frontendDir = path.join(projectRoot, 'frontend');

// Verify the frontend directory exists
if (!fs.existsSync(frontendDir)) {
  console.error(`Error: Frontend directory not found at ${frontendDir}`);
  process.exit(1);
}

try {
  console.log('Building frontend for desktop...');
  execSync('npm run build', {
    cwd: frontendDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_MAX_BACKEND_URL: 'http://127.0.0.1:4000',
      NEXT_PUBLIC_DESKTOP_BUILD: 'true',
    },
  });
  console.log('Frontend build complete!');
} catch (error) {
  console.error('Frontend build failed:', error.message);
  process.exit(1);
}

