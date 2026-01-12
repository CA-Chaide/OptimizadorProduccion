
'use client';

import React, { memo } from 'react';
import { LogProvider } from '@/context/LogContext';
import { OperationProvider } from '@/context/OperationContext';
import { AppProvider } from '@/context/AppProvider';
import { WidgetsStateProvider } from '@/context/WidgetsStateContext';
import FloatingChatWidget from '@/components/FloatingChatWidget';
import FloatingLogsWidget from '@/components/FloatingLogsWidget';
import DebugPanel from '@/components/DebugPanel';

interface RootLayoutWrapperProps {
  children: React.ReactNode;
}

function RootLayoutWrapper({ children }: RootLayoutWrapperProps) {
  return (
    <LogProvider>
      <OperationProvider>
        <AppProvider>
          <WidgetsStateProvider>
            {children}
            <FloatingChatWidget />
            <FloatingLogsWidget />
            <DebugPanel />
          </WidgetsStateProvider>
        </AppProvider>
      </OperationProvider>
    </LogProvider>
  );
}

export default memo(RootLayoutWrapper);
