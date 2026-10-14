import type { NextConfig } from 'next';

const config: NextConfig = {
  // Domain package ships TypeScript source; Next compiles it.
  transpilePackages: ['@auctionit/domain'],
  reactStrictMode: true,
  // The dev badge sits over the mobile bottom tab bar and shows up in demo recordings.
  devIndicators: false,
};

export default config;
