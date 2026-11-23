import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["argon2", "onnxruntime-node"],
  // Trim client bundles that pull large icon/util trees.
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "zod"],
  },
  // Case prep (the truth source) is read from disk at runtime by the
  // working-document start and the critique engine.
  outputFileTracingIncludes: {
    "/api/**/*": ["./docs/domain/**/*.md"],
    // Speaker model runtime (Linux build only) for voice enrollment and the
    // practice pipeline's speaker matching.
    "/api/voice/**/*": [
      "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**",
    ],
    "/api/practice/**/*": [
      "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://api.assemblyai.com https://api.resend.com https://ai-gateway.vercel.sh https://*.googleapis.com https://www.googleapis.com",
              "media-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), interest-cohort=(), microphone=(self)",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      // Fingerprinted Next assets: cache hard. Safe for phone reconnects.
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/cruxy/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/api/health",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
