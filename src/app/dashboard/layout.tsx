'use client';

import React from 'react';
import Image from 'next/image';
import { MainNav } from '@/components/main-nav';
import { Toaster } from "@/components/ui/toaster";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="hidden md:flex flex-col w-64 bg-primary text-primary-foreground">
        <div className="flex items-center justify-center h-20 bg-primary px-4 pt-5 pb-3">
          <Image src="/logo.png" alt="Chaide Logo" width={180} height={60} style={{width: 'auto', height: 'auto'}} />
        </div>
        <div className="flex flex-col flex-1 overflow-y-auto">
          <nav className="flex-1 px-2 py-4 space-y-2">
            <MainNav />
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
