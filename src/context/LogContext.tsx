'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { logger, LogEntry } from '@/services/LogService';

interface LogContextType {
  logs: LogEntry[];
  clearLogs: () => void;
}

const LogContext = createContext<LogContextType | undefined>(undefined);

export function LogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const unsubscribe = logger.subscribe((newLog) => {
      setLogs((prevLogs) => [...prevLogs, newLog]);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <LogContext.Provider value={{ logs, clearLogs }}>
      {children}
    </LogContext.Provider>
  );
}

export function useLogs() {
  const context = useContext(LogContext);
  if (context === undefined) {
    throw new Error('useLogs must be used within a LogProvider');
  }
  return context;
}
