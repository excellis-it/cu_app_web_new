// /* @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // compiler: {
  //   removeConsole: process.env.NODE_ENV === "production",
  // }, 
  devIndicators: false,
  images: {
    domains: ['myzulfi.s3.ap-south-1.amazonaws.com'],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_PROXY}/api/v1/:path*`,
       
      },
      
    ];
  },
};

module.exports = nextConfig;


// /** @type {import('next').NextConfig} */
// const nextConfig = {
//   async rewrites() {
//     // Get API URL with fallback for build time
//     const apiUrl = process.env.NEXT_PUBLIC_PROXY || 'http://chat-backend:4000';
    
//     // Validate the URL
//     if (!apiUrl || apiUrl === 'undefined') {
//       console.warn('⚠️  NEXT_PUBLIC_PROXY is not defined, using default');
//       return [
//         {
//           source: '/api/:path*',
//           destination: 'http://chat-backend:4000/api/v1/:path*',
//         },
//       ];
//     }

//     return [
//       {
//         source: '/api/:path*',
//         destination: `${apiUrl}/api/v1/:path*`,
//       },
//     ];
//   },
//   // Add other Next.js config options here
//   reactStrictMode: true,
//   swcMinify: true,
// };

// module.exports = nextConfig;