'use client';

import React from 'react';
import { ActiveView, viewConfig } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';
import { cn } from '@/lib/utils';

export function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { activeView, dispatch } = useAppContext();

  return (
    <nav className={cn('flex flex-col space-y-2', className)} {...props}>
      {Object.values(ActiveView).map(viewId => {
        const config = viewConfig[viewId];
        if (!config) return null;
        
        const isActive = activeView === viewId;

        return (
          <a
            key={viewId}
            href="#"
            onClick={(e) => {
                e.preventDefault();
                dispatch({ type: 'SET_ACTIVE_VIEW', payload: viewId })
            }}
            className={cn(
              'flex items-center px-3 py-2 text-primary-foreground rounded-md text-sm font-medium hover:bg-white/20',
              isActive && 'bg-white/25'
            )}
          >
            {React.cloneElement(config.icon, { className: 'h-5 w-5 mr-6' })}
            {config.title}
          </a>
        );
      })}
    </nav>
  );
}
