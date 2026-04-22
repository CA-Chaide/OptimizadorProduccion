'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const TacticalPlanMueblesSection = dynamic(
  () => import('@/components/TacticalPlanMueblesSection').then(mod => mod.TacticalPlanMueblesSection),
  { 
    ssr: false,
    loading: () => (
      <div className="p-6 md:p-8 flex justify-center items-center h-96">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }
);

export default function ProgramacionTacticaMueblesPage() {
  return <TacticalPlanMueblesSection />;
}
