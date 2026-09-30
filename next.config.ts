import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Dev previews are served from a proxied host; allow it to load /_next assets.
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev', 'localhost'],
  reactStrictMode: true,
  serverExternalPackages: [
    '@electric-sql/pglite',
    'pg',
    'mammoth',
    'xlsx',
    'unpdf',
    'jszip',
  ],
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(self)',
          },
          // Framing is intentionally not blocked here so the app can be
          // embedded in a preview shell; set frame-ancestors at your edge
          // proxy for a locked-down deployment.
        ],
      },
    ];
  },
};

export default nextConfig;
