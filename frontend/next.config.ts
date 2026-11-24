
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: "https://distributed-payment-gateway.onrender.com/api/auth/:path*",
      },
      {
        source: "/api/wallet/:path*",
        destination: "https://distributed-payment-gateway-wallet.onrender.com/api/wallet/:path*",
      },
      {
        source: "/api/payments/:path*",
        destination: "https://distributed-payment-gateway-payment.onrender.com/api/payments/:path*",
      },
      {
        source: "/api/notifications/:path*",
        destination: "https://distributed-payment-gateway-notification.onrender.com/api/notifications/:path*",
      },
    ];
  },
};

export default nextConfig;
