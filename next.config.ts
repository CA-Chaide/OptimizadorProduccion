
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/Aplicativos/ApiOptimizadorProduccion/:path*',
        destination: 'http://172.16.10.35:8091/Aplicativos/ApiOptimizadorProduccion/:path*',
      },
    ]
  },
};

export default nextConfig;

    