import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone: a self-contained server.js plus only the traced
  // node_modules, which is what the Dockerfile's runner stage copies. Without
  // this the image would have to carry the full dependency tree.
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
    ],
  }
};

export default nextConfig;
