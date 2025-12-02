'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { operationTracker, Operation } from '@/services/OperationTracker';
import { logger } from '@/services/LogService';

interface OperationContextType {
  operations: Operation[];
  activeOperations: Operation[];
  summary: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    bySection: Record<string, number>;
  };
  clearOperations: () => void;
}

const OperationContext = createContext<OperationContextType | undefined>(undefined);

export function OperationProvider({ children }: { children: React.ReactNode }) {
  const [, setTrigger] = useState(0);

  useEffect(() => {
    const unsubscribe = operationTracker.subscribe((operation) => {
      // Solo disparar re-render sin mantener estado duplicado
      setTrigger(prev => prev + 1);
      
      // Registrar en logs
      const statusEmoji = {
        'started': '▶️',
        'in_progress': '⏳',
        'completed': '✅',
        'failed': '❌',
        'pending': '⏸️'
      }[operation.status] || '•';
      
      const logMessage = `[${operation.section}] ${statusEmoji} ${operation.description}${operation.duration ? ` (${operation.duration}ms)` : ''}${operation.error ? ` - ERROR: ${operation.error}` : ''}`;
      logger.log(logMessage, operation.status === 'failed' ? 'error' : 'operation');
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Obtener datos directamente de operationTracker (single source of truth)
  const operations = operationTracker.getLatestOperations(50);
  const activeOperations = operationTracker.getActiveOperations();
  const summary = operationTracker.getSummary();

  const clearOperations = () => {
    operationTracker.clearOperations();
    setTrigger(prev => prev + 1);
  };

  return (
    <OperationContext.Provider value={{ operations, activeOperations, summary, clearOperations }}>
      {children}
    </OperationContext.Provider>
  );
}

export function useOperations() {
  const context = useContext(OperationContext);
  if (context === undefined) {
    throw new Error('useOperations must be used within an OperationProvider');
  }
  return context;
}
