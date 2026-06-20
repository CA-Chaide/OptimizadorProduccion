'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Wind, Package, Loader2, Wrench, ShoppingCart, RefreshCw, FileSpreadsheet, Activity, Scissors, Box, TrendingUp, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { serviciosService } from '@/services/servicios.service';
import { logger } from '@/services/LogService';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// --- CONSTANTES TÉCNICAS ---
const CAROUSEL_CIRCUMFERENCE = 2000; // cm
const MAX_STACK_HEIGHT = 200; // cm
const MANIPULATION_GAP = 5; // cm

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const parseDimensions = (desc: string) => {
  const d = String(desc || '').toUpperCase();
  const densMatch = d.match(/D(\d+)/);
  const dens = densMatch ? densMatch[1] : '—';
  
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
  const ancho = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const largo = dimMatch ? parseFloat(dimMatch[2]) : 0;
  const esp = dimMatch && dimMatch[3] ? parseFloat(dimMatch[3]) : 0;
  
  return { dens, ancho, largo, esp };
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('provisionales');
  const [ordenesProvisionales, setOrdenesProvisionales] = useState<any[]>([]);
  const [ordenesFert, setOrdenesFert] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [tiemposCatalogo, setTiemposCatalogo] = useState<any[]>([]);

  // Lógica de filtrado por almacén solicitada
  const filterByAlmacen = (data: any[], centro: string) => {
    return data.filter(item => {
      const c = String(item.Centro || item.CENTRO || '').trim();
      const aStr = String(item.Almacen || item.ALMACEN || '').trim();
      const a = parseInt(aStr);
      
      if (centro === '1000') {
        return c === '1000' && (a >= 1000 && a <= 1006);
      } else if (centro === '2000') {
        return c === '2000' && (a >= 2000 && a <= 2006);
      }
      return false;
    });
  };

  const getTiempoMaterial = (material: string, centro: string) => {
    const code = cleanCode(material);
    const match = tiemposCatalogo.find(t => cleanCode(t.CodMaterial) === code && String(t.Centro).trim() === centro);
    return match ? safeNum(match.Tiempo || match.Tiempo_Min) : 0;
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [provs, ferts, maint, times] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getOrdenesFert(1, 20000),
        serviciosService.ListarMantenimientoPreventivosProgramados(),
        serviciosService.getTiemposEnsamblado(1, 20000)
      ]);

      setOrdenesProvisionales(provs.data?.data || provs.data || []);
      setOrdenesFert(ferts.data?.data || ferts.data || []);
      setMantenimientos(maint.data || []);
      setTiemposCatalogo(times.data?.data || times.data || []);
      
    } catch (error) {
      console.error('Error al cargar datos de Corte Espuma', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, [fetchData]);

  const provUIO = useMemo(() => filterByAlmacen(ordenesProvisionales, '1000'), [ordenesProvisionales]);
  const provGYE = useMemo(() => filterByAlmacen(ordenesProvisionales, '2000'), [ordenesProvisionales]);
  const fertUIO = useMemo(() => filterByAlmacen(ordenesFert, '1000'), [ordenesFert]);
  const fertGYE = useMemo(() => filterByAlmacen(ordenesFert, '2000'), [ordenesFert]);

  // Construcción del reporte de salida integral (sin explosión BOM)
  const salidaData = useMemo(() => {
    const allOrders = [...provUIO, ...provGYE, ...fertUIO, ...fertGYE];
    return allOrders.map(o => {
      const desc = o.NOMBRE || o.Material || o.DESCRIPCION || '—';
      const dims = parseDimensions(desc);
      const qty = safeNum(o.CANTIDAD || o.CANTPROGRAMADA || 0);
      const tIndiv = getTiempoMaterial(o.MATERIAL || o.CodMaterial, String(o.Centro || o.CENTRO));
      
      const peso = (dims.ancho * dims.largo * dims.esp * safeNum(dims.dens)) / 10000;
      const volumen = dims.ancho * dims.largo * dims.esp;
      const cargas = dims.ancho > 0 ? Math.floor(CAROUSEL_CIRCUMFERENCE / (dims.ancho + MANIPULATION_GAP)) : 0;
      const subBloques = dims.esp > 0 ? Math.floor(MAX_STACK_HEIGHT / dims.esp) : 0;

      return {
        orden: o.ORDENPREVISIONAL || o.ORDEN || '—',
        fecha: o.FECHAINICIO || o.FECHA || '—',
        categoria: o.CATEGORIA || '—',
        material: cleanCode(o.MATERIAL || o.CodMaterial),
        descripcion: desc,
        ancho: dims.ancho,
        largo: dims.largo,
        esp: dims.esp,
        dens: dims.dens,
        cant: qty,
        peso: peso,
        volumen: volumen,
        tIndiv: tIndiv,
        tTotal: (tIndiv * qty) / 60,
        cargas: cargas,
        subBloques: subBloques,
        almacen: o.Almacen || o.ALMACEN || '—',
        centro: o.Centro || o.CENTRO || '—'
      };
    });
  }, [provUIO, provGYE, fertUIO, fertGYE, tiemposCatalogo]);

  const renderTable = (data: any[], title: string, color: string) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <div className={cn("w-2 h-2 rounded-full", color)} />
        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{title} ({data.length})</h3>
      </div>
      <div className="border border-gray-100 rounded-2xl shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto max-h-[400px]">
          <table className="min-w-full divide-y divide-gray-200 text-[10px] text-center">
            <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-wider border-b border-gray-100 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 text-left">Orden</th>
                <th className="px-3 py-3 text-left">Material</th>
                <th className="px-3 py-3 text-left">Descripción</th>
                <th className="px-3 py-3">Cant.</th>
                <th className="px-3 py-3">Alm.</th>
                <th className="px-3 py-3 bg-blue-50/50 text-blue-700">Tiempo (Min)</th>
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
              {data.map((o, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 text-left text-indigo-600 font-mono">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                  <td className="px-3 py-2 text-left font-mono">{cleanCode(o.MATERIAL || o.CodMaterial)}</td>
                  <td className="px-3 py-2 text-left uppercase truncate max-w-[250px]">{o.NOMBRE || o.Material || o.DESCRIPCION || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-900">{o.CANTIDAD || o.CANTPROGRAMADA || 0}</td>
                  <td className="px-3 py-2 text-slate-400">{o.Almacen || o.ALMACEN || '—'}</td>
                  <td className="px-3 py-2 font-mono text-blue-600 bg-blue-50/20">
                    {getTiempoMaterial(o.MATERIAL || o.CodMaterial, String(o.Centro || o.CENTRO)).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-500">{o.FECHAINICIO || o.FECHA || '—'}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[8px] font-black bg-slate-50 border-slate-200 text-slate-500 uppercase">
                      {o.RESPCONTROLPROD || o.RespControlProd || '—'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderRoot = (content: React.ReactNode) => (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><Scissors className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Laminado | Almacenes UIO (1000-1006) y GYE (2000-2006)</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-8">
          <TabsTrigger value="provisionales" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary rounded-lg">
            <Package className="w-3.5 h-3.5" /> PROVISIONALES
          </TabsTrigger>
          <TabsTrigger value="ordenesFert" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary rounded-lg">
            <ShoppingCart className="w-3.5 h-3.5" /> ÓRDENES FERT
          </TabsTrigger>
          <TabsTrigger value="salida" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 rounded-lg">
            <FileSpreadsheet className="w-3.5 h-3.5" /> SALIDA DE DATOS
          </TabsTrigger>
          <TabsTrigger value="mantenimiento" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary rounded-lg">
            <Wrench className="w-3.5 h-3.5" /> MMTO
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="py-32 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Sincronizando con Servidores SAP...</p>
          </div>
        ) : (
          <>
            <TabsContent value="provisionales" className="animate-in fade-in duration-300 space-y-10">
              {renderTable(provUIO, "CORTE ESPUMA UIO (Alm. 1000-1006)", "bg-green-600")}
              {renderTable(provGYE, "CORTE ESPUMA GYE (Alm. 2000-2006)", "bg-indigo-600")}
            </TabsContent>

            <TabsContent value="ordenesFert" className="animate-in fade-in duration-300 space-y-10">
              {renderTable(fertUIO, "ÓRDENES FERT UIO (Alm. 1000-1006)", "bg-green-600")}
              {renderTable(fertGYE, "ÓRDENES FERT GYE (Alm. 2000-2006)", "bg-indigo-600")}
            </TabsContent>

            <TabsContent value="salida" className="animate-in fade-in duration-300">
              <div className="border border-gray-100 rounded-3xl shadow-2xl overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[600px] relative">
                  <table className="w-full border-collapse text-center font-sans text-[10px]">
                    <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter text-[9px] border-b border-white/10 sticky top-0 z-20">
                      <tr>
                        <th className="px-3 py-4 border-r border-white/5">Orden</th>
                        <th className="px-3 py-4 border-r border-white/5">Fecha</th>
                        <th className="px-3 py-4 border-r border-white/5">Categoría</th>
                        <th className="px-4 py-4 border-r border-white/5 text-left">Material / Desc.</th>
                        <th className="px-2 py-4 border-r border-white/5 bg-indigo-900/50">Ancho</th>
                        <th className="px-2 py-4 border-r border-white/5 bg-indigo-900/50">Largo</th>
                        <th className="px-2 py-4 border-r border-white/5 bg-indigo-900/50">Esp.</th>
                        <th className="px-2 py-4 border-r border-white/5">Dens.</th>
                        <th className="px-3 py-4 border-r border-white/5">Cant.</th>
                        <th className="px-3 py-4 border-r border-white/5">Peso (Kg)</th>
                        <th className="px-3 py-4 border-r border-white/5">Volumen</th>
                        <th className="px-3 py-4 border-r border-white/5 text-teal-400">T. Indiv (m)</th>
                        <th className="px-3 py-4 border-r border-white/5 text-teal-400">T. Total (H)</th>
                        <th className="px-3 py-4 border-r border-white/5 text-emerald-400">Cargas</th>
                        <th className="px-3 py-4 text-emerald-400"># SUB_Bloque</th>
                        <th className="px-3 py-4 bg-slate-800">Alm.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-bold text-slate-600">
                      {salidaData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2 border-r border-gray-50 text-indigo-600 font-mono">{row.orden}</td>
                          <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-400">{row.fecha}</td>
                          <td className="px-3 py-2 border-r border-gray-50 uppercase text-[9px]">{row.categoria}</td>
                          <td className="px-4 py-2 border-r border-gray-50 text-left truncate max-w-[200px]">
                            <span className="text-indigo-900 block font-mono">{row.material}</span>
                            <span className="text-gray-400 text-[8px] uppercase italic">{row.descripcion}</span>
                          </td>
                          <td className="px-2 py-2 border-r border-gray-50 font-mono">{row.ancho.toFixed(2)}</td>
                          <td className="px-2 py-2 border-r border-gray-50 font-mono">{row.largo.toFixed(2)}</td>
                          <td className="px-2 py-2 border-r border-gray-50 font-mono text-blue-600">{row.esp.toFixed(2)}</td>
                          <td className="px-2 py-2 border-r border-gray-50 font-black text-slate-900">{row.dens}</td>
                          <td className="px-3 py-2 border-r border-gray-50 font-mono font-black text-slate-900">{row.cant}</td>
                          <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-400">{row.peso.toFixed(2)}</td>
                          <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-400">{row.volumen.toFixed(0)}</td>
                          <td className="px-3 py-2 border-r border-gray-50 font-mono text-teal-600">{row.tIndiv.toFixed(2)}</td>
                          <td className="px-3 py-2 border-r border-gray-50 font-mono text-indigo-600">{row.tTotal.toFixed(2)}</td>
                          <td className="px-3 py-2 border-r border-gray-50 font-black text-emerald-600 bg-emerald-50/20">{row.cargas}</td>
                          <td className="px-3 py-2 font-black text-emerald-600 bg-emerald-50/20 border-r border-gray-50">{row.subBloques}</td>
                          <td className="px-3 py-2 text-slate-200">{row.almacen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="mantenimiento" className="animate-in fade-in duration-300">
              <div className="border border-gray-100 rounded-2xl shadow-sm overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="min-w-full divide-y divide-gray-200 text-[10px] text-center">
                    <thead className="bg-[#fef3c7] text-amber-900 font-black uppercase border-b border-amber-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-4 text-left">Planta</th>
                        <th className="px-6 py-4 text-left">Máquina / Recurso</th>
                        <th className="px-6 py-4 text-left">Programación Inicio</th>
                        <th className="px-6 py-4 text-left">Programación Fin</th>
                        <th className="px-6 py-4">Estado SAP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-bold">
                      {mantenimientos.map((m, i) => (
                        <tr key={i} className="hover:bg-amber-50/20 transition-colors">
                          <td className="px-6 py-3 text-slate-400 text-left">{m.PLANTA || '—'}</td>
                          <td className="px-6 py-3 text-indigo-900 font-black text-left uppercase">{m.ID_MAQUINA || '—'}</td>
                          <td className="px-6 py-3 text-left font-mono">{m.FECHA_OT_PRG_INI || '—'}</td>
                          <td className="px-6 py-3 text-left font-mono">{m.FECHA_OT_PRG_FIN || '—'}</td>
                          <td className="px-6 py-3">
                            <Badge variant="outline" className="text-[8px] bg-amber-50 border-amber-200 text-amber-600 font-black uppercase">
                              {m.ESTADO || 'PROGRAMADO'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );

  if (!mounted) return renderRoot(<div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);
  return renderRoot(null);
};
