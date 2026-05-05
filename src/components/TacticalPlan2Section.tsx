'use client';

import React, { useState } from 'react';
import { CalendarClock, Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';

export const TacticalPlan2Section: React.FC = () => {
  const [activeTab, setActiveTab] = useState('ordenes');

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-indigo-600/10 rounded-xl"><CalendarClock className="w-6 h-6 text-indigo-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Programación Táctica Colchones</h2>
            <p className="text-xs text-gray-500 font-medium">Gestión de Órdenes Provisionales</p>
          </div>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-1 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          <TabsTrigger value="ordenes" className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Package className="w-3.5 h-3.5" /> Órdenes Provisionales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ordenes" className="animate-in fade-in duration-300">
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
            <CardContent className="p-0">
              <ProvisionalOrdersTabSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};