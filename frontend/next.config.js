const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // For desktop builds, we'll use static export
  // Note: App Router requires output: 'export' for static builds
  output: process.env.NEXT_PUBLIC_DESKTOP_BUILD === 'true' ? 'export' : undefined,
  // Disable image optimization for static export
  images: {
    unoptimized: process.env.NEXT_PUBLIC_DESKTOP_BUILD === 'true',
  },
  // Ensure trailing slash for static export compatibility
  trailingSlash: process.env.NEXT_PUBLIC_DESKTOP_BUILD === 'true',
  // Configure webpack to handle Tauri API imports
  webpack: (config, { isServer }) => {
    // Ignore Tauri API modules during build (they're only available in Tauri runtime)
    if (!isServer) {
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^@tauri-apps\/api\/updater$/,
        })
      );
    }
    return config;
  },
}

module.exports = nextConfig

