import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow cross-origin requests in development from Docker containers and local network
  allowedDevOrigins: ['172.17.0.1', '172.18.0.1', 'localhost', '127.0.0.1', '0.0.0.0'],

  // Additional headers for CORS support
  async headers() {
    return [
      {
        // Apply headers to all API routes
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NODE_ENV === 'development' ? '*' : 'https://your-domain.com',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-Requested-With',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
        ],
      },
    ]
  },
}

export default nextConfig
