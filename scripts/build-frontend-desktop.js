#!/usr/bin/env node

// Build script for desktop frontend
// This ensures cross-platform compatibility for environment variables

const { execSync } = require('child_process');
const path = require('path');

process.env.NEXT_PUBLIC_MAX_BACKEND_URL = 'http://127.0.0.1:4000';
process.env.NEXT_PUBLIC_DESKTOP_BUILD = 'true';

const frontendDir = path.join(__dirname, '..', 'frontend');

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

