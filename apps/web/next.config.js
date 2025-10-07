/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: true
  },
  output: 'standalone',
  transpilePackages: ['@ai-hairdresser/shared']
};

module.exports = nextConfig;
