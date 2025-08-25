
'use client';

import React, { createContext, useContext } from 'react';
import { useAppState } from '@/hooks/useAppState';
import type { AppState, AppAction, NotificationMessage, TacticalRequest, TacticalPlanResult, SalesDataRow, Employee, EmployeeSkill, AbsenteeismEvent, MaintenanceEvent, WorkShift, AppConstraints } from '@/types/types';

// Define el tipo para el valor del contexto completo, incluyendo el estado y las funciones.
type AppContextType = ReturnType<typeof useAppState>;

// Crea el contexto con un valor inicial undefined
export const AppContext = createContext<AppContextType | undefined>(undefined);

// Hook personalizado para usar el contexto de la aplicación
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

// El componente proveedor
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const appStateAndActions = useAppState();

  return (
    <AppContext.Provider value={appStateAndActions}>
      {children}
    </AppContext.Provider>
  );
};
