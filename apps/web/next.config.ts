import type { NextConfig } from 'next';

const config: NextConfig = {
  // Domain package ships TypeScript source; Next compiles it.
  transpilePackages: ['@auctionit/domain'],
  reactStrictMode: true,
};

export default config;
