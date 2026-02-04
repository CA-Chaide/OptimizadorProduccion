'use client';

import { MaintenanceSection } from '@/components';
import { useAppContext } from '@/context/AppProvider';

export default function MantenimientoPage() {
  const { maintenanceEvents, setMaintenanceEvents, constraints, setConstraints, addNotification } = useAppContext();
  return (
    <MaintenanceSection 
      events={maintenanceEvents} 
      setEvents={setMaintenanceEvents} 
      constraints={constraints} 
      onConstraintsUpdate={setConstraints} 
      addNotification={addNotification} 
    />
  );
}
