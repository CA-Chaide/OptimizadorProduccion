
'use client';

import React from 'react';
import { AppProvider } from '@/context/AppProvider';

export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AppProvider>
      {children}
    </AppProvider>
  );
};
