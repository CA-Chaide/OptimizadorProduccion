
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { Toaster } from '@/components/ui/toaster';
import { AppProvider } from '@/context/AppProvider';

import '@/app/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Optimizador de Producción',
  description: 'Una aplicación web para optimizar planes de producción basados en datos de ventas y restricciones configurables, con visualizaciones de dashboard. Permite importar datos de ventas, definir restricciones operativas, generar planes de producción y visualizar métricas clave.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AppProvider>
          {children}
        </AppProvider>
        <Toaster />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
