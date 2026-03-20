'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { MainNav } from '@/components/main-nav';
import { Toaster } from "@/components/ui/toaster";
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`hidden md:flex flex-col bg-primary text-primary-foreground transition-all duration-300 ease-in-out ${
        isSidebarCollapsed ? 'w-20' : 'w-64'
      }`}>
        <div className="flex items-center justify-center h-20 bg-primary px-4 pt-5 pb-3 relative">
          {!isSidebarCollapsed && (
            <Image src="/logo.png" alt="Chaide Logo" width={180} height={60} style={{width: 'auto', height: 'auto'}} />
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="flex items-center justify-center p-2 mx-2 mb-2 rounded-md hover:bg-white/20 transition-colors"
          title={isSidebarCollapsed ? 'Expandir' : 'Contraer'}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>

        <div className="flex flex-col flex-1 overflow-y-auto">
          <nav className="flex-1 px-2 py-4 space-y-2">
            <MainNav isCollapsed={isSidebarCollapsed} />
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        <div className="p-4">
          {children}
        </div>
      </div>
      <Toaster />
    </div>
  );
}
