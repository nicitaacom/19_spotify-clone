/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // hostname: "eqhntdpwtnhqzcnpxegh.supabase.co", // it was for old supabase that might be paused due to inactivity
        hostname: "sckioxanzluozlghvnts.supabase.co",
        port: "",
      },
    ],
  },
  // Removed: experimental.middlewareClientMaxBodySize (was meant to allow large archive uploads to
  // /api/backup/import, default cap is 10 MB) — not a real Next.js option, silently ignored, and
  // didn't matter anyway since Vercel's ~4.5MB function body cap sits in front of it regardless.
  // Import now uploads archives directly to Supabase via a signed URL instead, bypassing the
  // Vercel function body entirely (see dev_readme-backup.md).
}

module.exports = nextConfig

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
