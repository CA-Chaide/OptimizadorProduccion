
'use client';

import React from 'react';
import { ActiveView, viewConfig } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';
import { cn } from '@/lib/utils';

export function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { activeView, dispatch } = useAppContext();

  return (
    <nav className={cn('flex flex-col', className)} {...props}>
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
              'flex items-center px-4 py-2 mt-2 text-gray-100 rounded hover:bg-gray-700',
              isActive && 'bg-gray-700'
            )}
          >
            {React.cloneElement(config.icon, { className: 'h-6 w-6 mr-3' })}
            {config.title}
          </a>
        );
      })}
    </nav>
  );
}
