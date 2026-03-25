import './src/env.mjs';
/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['myzulfi.s3.ap-south-1.amazonaws.com'],
    remotePatterns: [
     
      {
        protocol: 'https',
        hostname: 'files.cpscomhub.com',
      },
      {
        protocol: 'https',
        hostname: 'files.cu-app.us',
      },
      {
        protocol: 'https',
        hostname: 'extalkfile.excellisit.net',
      },
      {
        protocol: 'https',
        hostname: 'isomorphic-furyroad.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'randomuser.me',
        pathname: '/api/portraits/**',
      },
      {
        protocol: 'https',
        hostname: 'cloudflare-ipfs.com',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/u/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
      {
        protocol: 'https',
        hostname: 'utfs.io',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 's3.amazonaws.com',
        pathname: '/redqteam.com/isomorphic-furyroad/public/**',
      },
      {
        protocol: 'https',
        hostname: 'isomorphic-furyroad.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'etexcellisit.s3.ap-south-1.amazonaws.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '7000',
        pathname: '/uploads/**',
      },
    ],
  },
  reactStrictMode: false,

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_BACKEND_URL+"/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
