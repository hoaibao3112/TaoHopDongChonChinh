import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/contracts/export': ['./templates/**/*'],
  },

  // ✅ Bảo mật: HTTP Security Headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Chống Clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Chống MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Kiểm soát Referrer
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Hạn chế quyền trình duyệt
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS (chỉ hiệu lực trên HTTPS/production)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Content Security Policy cơ bản
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval cần cho Next.js dev
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self' https://upright-dogfish-99021.upstash.io https://generativelanguage.googleapis.com",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
