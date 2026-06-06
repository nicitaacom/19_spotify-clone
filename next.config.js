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
}

module.exports = nextConfig
