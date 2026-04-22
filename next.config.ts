
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
        // Proxy para redirigir peticiones locales a la API de Chaide evitando CORS
        // Actualizado a la URL reportada por el usuario (apps.chaide.com)
        source: '/Aplicativos/ApiOptimizadorProduccion/:path*',
        destination: 'https://apps.chaide.com/ProductionOptimizer/:path*',
      },
    ]
  },
};

export default nextConfig;
