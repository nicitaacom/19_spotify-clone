/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // hostname: "eqhntdpwtnhqzcnpxegh.supabase.co", // it was for old supabase that might be paused due to inactivity
        hostname: "supabase.music.jokik.fi",
        port: "",
      },
    ],
  },
  experimental: {
    // Next's proxy buffers request bodies before app route handlers can parse them. The upload UI
    // permits a 50 MiB MP3 plus a cover image, so leave sufficient multipart overhead.
    proxyClientMaxBodySize: "55mb",
  },
}

module.exports = nextConfig

import("@opennextjs/cloudflare").then(m => m.initOpenNextCloudflareForDev())
