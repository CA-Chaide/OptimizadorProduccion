'use client';

import { AbsenteeismSection } from '@/components';
import { useAppContext } from '@/context/AppProvider';

export default function GestionAusentismosPage() {
  const { absenteeismEvents, setAbsenteeismEvents, employees } = useAppContext();
  return (
    <AbsenteeismSection 
      events={absenteeismEvents} 
      setEvents={setAbsenteeismEvents} 
      employees={employees} 
    />
  );
}
