'use client';

import { DataImportSection } from '@/components';
import { useAppContext } from '@/context/AppProvider';

export default function ImportarVentasPage() {
  const { handleDataImported } = useAppContext();
  return <DataImportSection onDataImported={handleDataImported} />;
}
