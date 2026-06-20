'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Wind, Package, Loader2, Wrench, ShoppingCart, RefreshCw, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { serviciosService } from '@/services/servicios.service';
import { logger } from '@/services/LogService';
import { Badge } from '@/components/ui/badge';

export const TacticalPlanEspumasSection: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('provisionales');
  const [ordenesProvisionales, setOrdenesProvisionales] = useState<any[]>([]);
  const [ordenesFert, setOrdenesFert] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      logger.log('[Corte Espuma] Sincronizando datos integrales desde SAP...');
      const [provs, ferts, maint] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getOrdenesFert(1, 20000),
        serviciosService.ListarMantenimientoPreventivosProgramados()
      ]);

      setOrdenesProvisionales(provs.data?.data || provs.data || []);
      setOrdenesFert(ferts.data?.data || ferts.data || []);
      setMantenimientos(maint.data || []);
      
      logger.success(`[Corte Espuma] Sincronización completa. Registros cargados.`);
    } catch (error) {
      logger.error('Error al cargar datos de Corte Espuma', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      fetchData();
    }
  }, [mounted, fetchData]);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner">
            <Wind className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Vista de Datos Integrales - SAP Live Data</p>
          </div>
        </div>
        <Button 
          onClick={fetchData} 
          disabled={isLoading} 
          variant="outline" 
          className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm"
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} ACTUALIZAR DATOS
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          <TabsTrigger value="provisionales" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary rounded-lg">
            <Package className="w-3.5 h-3.5" /> PPROVISIONALES
          </TabsTrigger>
          <TabsTrigger value="ordenesFert" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary rounded-lg">
            <ShoppingCart className="w-3.5 h-3.5" /> FERT
          </TabsTrigger>
          <TabsTrigger value="mantenimiento" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary rounded-lg">
            <Wrench className="w-3.5 h-3.5" /> MMTO
          </TabsTrigger>
        </TabsList>

        <div className="relative">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Sincronizando con SAP...</p>
            </div>
          ) : (
            <>
              <TabsContent value="provisionales" className="animate-in fade-in duration-300">
                <div className="border border-gray-100 rounded-2xl shadow-xl overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[650px]">
                    <table className="min-w-full divide-y divide-gray-200 text-[10px]">
                      <thead className="bg-[#f8fafc] text-slate-500 uppercase font-black tracking-wider border-b border-gray-100 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-4 text-left">Orden Previsional</th>
                          <th className="px-3 py-4 text-left">Material</th>
                          <th className="px-3 py-4 text-left">Nombre / Descripción</th>
                          <th className="px-3 py-4 text-left">Categoría</th>
                          <th className="px-3 py-4 text-right">Cantidad</th>
                          <th className="px-3 py-4 text-center">Unidad</th>
                          <th className="px-3 py-4 text-center">Fecha Inicio</th>
                          <th className="px-3 py-4 text-center">Fecha Fin</th>
                          <th className="px-3 py-4 text-center">Centro</th>
                          <th className="px-3 py-4 text-center">Almacén</th>
                          <th className="px-3 py-4 text-center">Máquina</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
                        {ordenesProvisionales.length === 0 ? (
                          <tr><td colSpan={11} className="py-24 text-center text-slate-200 uppercase tracking-widest italic">No hay órdenes provisionales cargadas</td></tr>
                        ) : (
                          ordenesProvisionales.map((o, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-2 text-left text-indigo-600">{o.ORDENPREVISIONAL || '—'}</td>
                              <td className="px-3 py-2 text-left font-mono">{o.MATERIAL || '—'}</td>
                              <td className="px-3 py-2 text-left uppercase truncate max-w-[250px]">{o.NOMBRE || '—'}</td>
                              <td className="px-3 py-2 text-left text-slate-400">{o.CATEGORIA || '—'}</td>
                              <td className="px-3 py-2 text-right font-mono text-gray-900">{o.CANTIDAD || o.CANTPROGRAMADA || 0}</td>
                              <td className="px-3 py-2 text-center text-slate-400">{o.UNIDAD || '—'}</td>
                              <td className="px-3 py-2 text-center font-mono text-slate-500">{o.FECHAINICIO || '—'}</td>
                              <td className="px-3 py-2 text-center font-mono text-slate-500">{o.FECHAFIN || '—'}</td>
                              <td className="px-3 py-2 text-center">{o.Centro || '—'}</td>
                              <td className="px-3 py-2 text-center text-slate-400">{o.Almacen || o.ALMACEN || '—'}</td>
                              <td className="px-3 py-2 text-center text-indigo-400 uppercase">{o.MAQUINA || o.RECURSO || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="ordenesFert" className="animate-in fade-in duration-300">
                <div className="border border-gray-100 rounded-2xl shadow-xl overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[650px]">
                    <table className="min-w-full divide-y divide-gray-200 text-[10px]">
                      <thead className="bg-[#f8fafc] text-slate-500 uppercase font-black tracking-wider border-b border-gray-100 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-4 text-left">Orden</th>
                          <th className="px-3 py-4 text-left">Material</th>
                          <th className="px-3 py-4 text-left">Descripción</th>
                          <th className="px-3 py-4 text-left">Categoría</th>
                          <th className="px-3 py-4 text-right">Cantidad</th>
                          <th className="px-3 py-4 text-center">Unidad</th>
                          <th className="px-3 py-4 text-center">Fecha</th>
                          <th className="px-3 py-4 text-center">Centro</th>
                          <th className="px-3 py-4 text-center">Almacén</th>
                          <th className="px-3 py-4 text-center">Máquina</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
                        {ordenesFert.length === 0 ? (
                          <tr><td colSpan={10} className="py-24 text-center text-slate-200 uppercase tracking-widest italic">No hay órdenes FERT cargadas</td></tr>
                        ) : (
                          ordenesFert.map((o, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-2 text-left text-indigo-600">{o.ORDEN || '—'}</td>
                              <td className="px-3 py-2 text-left font-mono">{o.MATERIAL || '—'}</td>
                              <td className="px-3 py-2 text-left uppercase truncate max-w-[250px]">{o.NOMBRE || o.DESCRIPCION || '—'}</td>
                              <td className="px-3 py-2 text-left text-slate-400">{o.CATEGORIA || '—'}</td>
                              <td className="px-3 py-2 text-right font-mono text-gray-900">{o.CANTIDAD || 0}</td>
                              <td className="px-3 py-2 text-center text-slate-400">{o.UNIDAD || '—'}</td>
                              <td className="px-3 py-2 text-center font-mono text-slate-500">{o.FECHA || '—'}</td>
                              <td className="px-3 py-2 text-center">{o.CENTRO || o.Centro || '—'}</td>
                              <td className="px-3 py-2 text-center text-slate-400">{o.ALMACEN || o.Almacen || '—'}</td>
                              <td className="px-3 py-2 text-center text-indigo-400 uppercase">{o.MAQUINA || o.RECURSO || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="mantenimiento" className="animate-in fade-in duration-300">
                <div className="border border-gray-100 rounded-2xl shadow-xl overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[650px]">
                    <table className="min-w-full border-collapse text-[10px]">
                      <thead className="bg-[#fef3c7] text-amber-900 font-black uppercase border-b border-amber-200 sticky top-0 z-10">
                        <tr>
                          <th className="px-6 py-4 text-left">Planta</th>
                          <th className="px-6 py-4 text-left">Recurso / Máquina</th>
                          <th className="px-6 py-4 text-left">Fecha Inicio</th>
                          <th className="px-6 py-4 text-left">Fecha Fin</th>
                          <th className="px-6 py-4 text-left">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-bold text-amber-950/80">
                        {mantenimientos.length === 0 ? (
                          <tr><td colSpan={5} className="py-24 text-center text-slate-200 uppercase tracking-widest italic">Sin tareas de mantenimiento registradas</td></tr>
                        ) : (
                          mantenimientos.map((m, i) => (
                            <tr key={i} className="hover:bg-amber-50/20 transition-colors">
                              <td className="px-6 py-3 text-slate-400">{String(m.PLANTA || '—')}</td>
                              <td className="px-6 py-3 text-indigo-900 font-black">{String(m.ID_MAQUINA || '—')}</td>
                              <td className="px-6 py-3 text-left font-mono text-slate-500">{m.FECHA_OT_PRG_INI || m.FECHA_INI || '—'}</td>
                              <td className="px-6 py-3 text-left font-mono text-slate-500">{m.FECHA_OT_PRG_FIN || m.FECHA_FIN || '—'}</td>
                              <td className="px-6 py-3">
                                <Badge variant="outline" className="text-[8px] bg-amber-50 border-amber-200 text-amber-600 font-black uppercase">
                                  {m.ESTADO || 'Programado'}
                                </Badge>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>

      <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl">
        <AlertCircle className="w-4 h-4 text-blue-600" />
        <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
          Modo Integral: Visualizando data cruda de SAP para Provisionales, FERT y Mantenimiento. Sin filtros ni cálculos técnicos aplicados.
        </p>
      </div>
    </div>
  );
};
