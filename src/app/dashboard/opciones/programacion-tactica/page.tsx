'use client';

import { TacticalPlanSection } from '@/components';
import { useAppContext } from '@/context/AppProvider';

export default function ProgramacionTacticaPage() {
  const { handleGenerateTacticalPlan } = useAppContext();
  return <TacticalPlanSection onGeneratePlan={handleGenerateTacticalPlan} />;
}
