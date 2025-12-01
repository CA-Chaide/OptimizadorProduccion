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
  const [operations, setOperations] = useState<Operation[]>([]);

  useEffect(() => {
    const unsubscribe = operationTracker.subscribe((operation) => {
      setOperations((prevOps) => [...prevOps, operation]);
      
      // También registrar en logs para que el agente pueda verlas
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

  const activeOperations = operationTracker.getActiveOperations();
  const summary = operationTracker.getSummary();

  const clearOperations = () => {
    operationTracker.clearOperations();
    setOperations([]);
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
