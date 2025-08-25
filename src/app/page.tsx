
'use client';

import ProductionOptimizerPage from '@/app/(app)/page';
import { AppProvider } from '@/context/AppProvider';

export default function Home() {
  return (
    <AppProvider>
      <ProductionOptimizerPage />
    </AppProvider>
  );
}

    