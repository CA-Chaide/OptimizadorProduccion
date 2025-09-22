'use client';

import React from 'react';
import { ActiveView, viewConfig } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { activeView, dispatch, isLoading } = useAppContext();

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
              'flex items-center px-3 py-2 text-primary-foreground rounded-md text-sm font-medium hover:bg-white/20 gap-x-3',
              isActive && 'bg-white/25',
              isLoading ? 'cursor-not-allowed opacity-50' : ''
            )}
          >
            {React.cloneElement(config.icon, { className: 'h-5 w-5' })}
            <span className="flex-1">{config.title}</span>
            {isLoading && viewId === ActiveView.PRODUCTION_PLAN && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </a>
        );
      })}
    </nav>
  );
}
