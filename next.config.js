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
  // Allow large archive uploads to /api/backup/import (default cap is 10 MB)
  experimental: {
    middlewareClientMaxBodySize: "2gb",
  },
}

module.exports = nextConfig
