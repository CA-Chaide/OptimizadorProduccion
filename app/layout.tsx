import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { Toaster } from '@/components/ui/toaster';

// Import app global CSS. Using a relative path to the file in src ensures
// TypeScript recognizes the file (avoids alias resolution issues in some
// editor/TS server configurations).
// @ts-ignore – The TypeScript/TS server can still have issues resolving
// side-effect CSS imports in some workspace configs; it's safe to ignore
// the compile-time import check here since we also have declarations for
// '*.css' in global.d.ts.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import '../src/app/globals.css';
import { cn } from '@/lib/utils';
import RootLayoutWrapper from '@/components/RootLayoutWrapper';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Planificador Produccion',
  description: 'Application for optimizing production planning.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={cn('min-h-screen bg-background font-sans antialiased', inter.variable)} suppressHydrationWarning>
        <RootLayoutWrapper>
          {children}
        </RootLayoutWrapper>
        <Toaster />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
