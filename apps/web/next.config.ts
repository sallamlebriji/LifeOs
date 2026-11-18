import type { NextConfig } from 'next';
import { join } from 'node:path';

const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:4010';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for the production Docker image.
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '../..'),
  transpilePackages: ['@lifeos/ui'],
  // Proxy the API through the web origin: auth cookies stay first-party and
  // SameSite=Lax, and no CORS is needed in the browser.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
