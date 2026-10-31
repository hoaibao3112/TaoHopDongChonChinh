import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/contracts/export': ['./templates/**/*'],
  },
};

export default nextConfig;
