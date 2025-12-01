"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';

interface WidgetsStateContextType {
  chatIsOpen: boolean;
  logsIsOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  openLogs: () => void;
  closeLogs: () => void;
}

const WidgetsStateContext = createContext<WidgetsStateContextType | undefined>(undefined);

export function WidgetsStateProvider({ children }: { children: React.ReactNode }) {
  const [chatIsOpen, setChatIsOpen] = useState(false);
  const [logsIsOpen, setLogsIsOpen] = useState(false);

  const openChat = useCallback(() => {
    setChatIsOpen(true);
    setLogsIsOpen(false);
  }, []);

  const closeChat = useCallback(() => {
    setChatIsOpen(false);
  }, []);

  const openLogs = useCallback(() => {
    setLogsIsOpen(true);
    setChatIsOpen(false);
  }, []);

  const closeLogs = useCallback(() => {
    setLogsIsOpen(false);
  }, []);

  return (
    <WidgetsStateContext.Provider value={{ chatIsOpen, logsIsOpen, openChat, closeChat, openLogs, closeLogs }}>
      {children}
    </WidgetsStateContext.Provider>
  );
}

export function useWidgetsState() {
  const context = useContext(WidgetsStateContext);
  if (!context) {
    throw new Error('useWidgetsState must be used within WidgetsStateProvider');
  }
  return context;
}
