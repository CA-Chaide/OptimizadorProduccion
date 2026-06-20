'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Scissors, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  ShoppingCart, 
  RefreshCw, 
  FileSpreadsheet, 
  Wrench,
  ChevronDown,
  ChevronRight,
  MapPin,
  Box,
  Wind,
  Minus,
  Plus
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { serviciosService } from '@/services/servicios.service';
import { logger } from '@/services/LogService';
import { cn } from '@/lib/utils';

// --- CONSTANTES TÉCNICAS DE INGENIERÍA ---
const CAROUSEL_CIRCUMFERENCE = 2000; 
const MAX_STACK_HEIGHT = 200; 
const MANIPULATION_GAP = 5; 

// --- CONFIGURACIÓN DE FILTROS SAP ---
const UIO_RESPONSABLES = ['013', '038', '039', '044', '036'];
const GYE_RESPONSABLES = ['002', '039'];
const UIO_ALMACEN_PROV = '1006';
const GYE_ALMACEN_PROV = '2006';

/**
 * Busca una propiedad en un objeto ignorando mayúsculas/minúsculas y guiones bajos
 */
const getProp = (obj: any, keys: string[]): string => {
  if (!obj) return '';
  const rowKeys = Object.keys(obj);
  for (const k of keys) {
    const found = rowKeys.find(rk => rk.toLowerCase().replace(/_/g, '') === k.toLowerCase().replace(/_/g, ''));
    if (found) return String(obj[found]).trim();
  }
  return '';
};

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
  
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s racer*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
  const ancho = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const largo = dimMatch ? parseFloat(dimMatch[2]) : 0;
  const esp = dimMatch && dimMatch[3] ? parseFloat(dimMatch[3]) : 0;
  
  return { dens, ancho, largo, esp };
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('salida');
  const [ordenesProvisionales, setOrdenesProvisionales] = useState<any[]>([]);
  const [ordenesProceso, setOrdenesProceso] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [tiemposCatalogo, setTiemposCatalogo] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [provs, ferts, maint, times] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] })),
        serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] })),
        serviciosService.getTiemposEnsamblado(1, 20000).catch(() => ({ data: [] }))
      ]);

      setOrdenesProvisionales(provs.data?.data || provs.data || []);
      setOrdenesProceso(ferts.data?.data || ferts.data || []);
      setMantenimientos(maint.data || []);
      setTiemposCatalogo(times.data?.data || times.data || []);
      
    } catch (error) {
      logger.error('[Corte Espuma] Error en sincronización operativa', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, [fetchData]);

  const getTiempoMaterial = (material: string, centro: string) => {
    const code = cleanCode(material);
    const match = tiemposCatalogo.find(t => cleanCode(t.CodMaterial) === code && String(t.Centro).trim() === centro);
    return match ? safeNum(match.Tiempo || match.Tiempo_Min) : 0;
  };

  // --- FILTROS DE PLANTA ---
  const provUIO = useMemo(() => ordenesProvisionales.filter(o => getProp(o, ['Centro', 'CENTRO']) === '1000' && getProp(o, ['Almacen', 'ALMACEN']) === UIO_ALMACEN_PROV), [ordenesProvisionales]);
  const provGYE = useMemo(() => ordenesProvisionales.filter(o => getProp(o, ['Centro', 'CENTRO']) === '2000' && getProp(o, ['Almacen', 'ALMACEN']) === GYE_ALMACEN_PROV), [ordenesProvisionales]);

  const procesoUIO = useMemo(() => ordenesProceso.filter(o => {
    const centro = String(getProp(o, ['Centro', 'CENTRO'])).trim();
    const resp = String(getProp(o, ['RESPCONTROLPROD', 'RespControlProd', 'RESP_CONTROL_PROD'])).trim();
    return centro === '1000' && UIO_RESPONSABLES.includes(resp);
  }), [ordenesProceso]);

  const procesoGYE = useMemo(() => ordenesProceso.filter(o => {
    const centro = String(getProp(o, ['Centro', 'CENTRO'])).trim();
    const resp = String(getProp(o, ['RESPCONTROLPROD', 'RespControlProd', 'RESP_CONTROL_PROD'])).trim();
    return centro === '2000' && GYE_RESPONSABLES.includes(resp);
  }), [ordenesProceso]);

  // --- SALIDA DE DATOS JERÁRQUICA ---
  const auditHierarchy = useMemo(() => {
    const all = [...provUIO, ...provGYE]; 
    const hierarchy = new Map<string, Map<string, any[]>>();

    all.forEach(o => {
      const centro = String(getProp(o, ['Centro', 'CENTRO'])).trim() === '1000' ? 'QUITO (UIO)' : 'GUAYAQUIL (GYE)';
      const cat = String(getProp(o, ['CATEGORIA', 'Categoria']) || 'SIN CATEGORÍA').toUpperCase();

      if (!hierarchy.has(centro)) hierarchy.set(centro, new Map());
      const centerMap = hierarchy.get(centro)!;
      if (!centerMap.has(cat)) centerMap.set(cat, []);

      const desc = getProp(o, ['NOMBRE', 'Material', 'DESCRIPCION']) || '—';
      const dims = parseDimensions(desc);
      const qty = safeNum(getProp(o, ['CANTIDAD', 'CANTPROGRAMADA']));
      const centerId = String(getProp(o, ['Centro', 'CENTRO']));
      const tIndiv = getTiempoMaterial(getProp(o, ['MATERIAL', 'CodMaterial']), centerId);

      centerMap.get(cat)!.push({
        orden: getProp(o, ['ORDENPREVISIONAL', 'ORDEN']) || '—',
        material: cleanCode(getProp(o, ['MATERIAL', 'CodMaterial'])),
        descripcion: desc,
        ancho: dims.ancho,
        largo: dims.largo,
        esp: dims.esp,
        dens: dims.dens,
        cant: qty,
        peso: (dims.ancho * dims.largo * dims.esp * safeNum(dims.dens)) / 10000,
        volumen: (dims.ancho * dims.largo * dims.esp) / 1000000,
        tIndiv: tIndiv,
        tTotal: (tIndiv * qty) / 60,
        cargas: dims.ancho > 0 ? Math.floor(CAROUSEL_CIRCUMFERENCE / (dims.ancho + MANIPULATION_GAP)) : 0,
        subBloques: dims.esp > 0 ? Math.floor(MAX_STACK_HEIGHT / dims.esp) : 0,
      });
    });

    return Array.from(hierarchy.entries()).sort();
  }, [provUIO, provGYE, tiemposCatalogo]);

  const renderDataTable = (data: any[]) => (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-[10px] text-center">
          <thead className="bg-slate-50 text-slate-500 uppercase font-black tracking-tighter border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left border-r border-slate-100">Orden SAP</th>
              <th className="px-4 py-3 text-left border-r border-slate-100">Código</th>
              <th className="px-6 py-3 text-left border-r border-slate-200">Descripción del Material</th>
              <th className="px-4 py-3 border-r border-slate-100">Cant.</th>
              <th className="px-4 py-3 border-r border-slate-100">Fecha</th>
              <th className="px-4 py-3 border-r border-slate-100">Responsable</th>
              <th className="px-4 py-3">Máquina</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
            {data.length === 0 ? (
              <tr><td colSpan={7} className="py-20 text-slate-200 uppercase tracking-widest italic">Sin actividad reportada</td></tr>
            ) : (
              data.map((o, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2 text-left font-mono text-indigo-600 border-r border-slate-50">{getProp(o, ['ORDENPREVISIONAL', 'ORDEN']) || '—'}</td>
                  <td className="px-4 py-2 text-left font-mono text-slate-900 border-r border-slate-50">{cleanCode(getProp(o, ['MATERIAL', 'CodMaterial']))}</td>
                  <td className="px-6 py-2 text-left uppercase truncate max-w-[350px] border-r border-slate-100 text-slate-500">{getProp(o, ['NOMBRE', 'Material', 'DESCRIPCION'])}</td>
                  <td className="px-4 py-2 font-mono text-slate-900 bg-slate-50/20 border-r border-slate-50">{getProp(o, ['CANTIDAD', 'CANTPROGRAMADA'])}</td>
                  <td className="px-4 py-2 font-mono text-slate-400 border-r border-slate-50">{getProp(o, ['FECHAINICIO', 'FECHA'])}</td>
                  <td className="px-4 py-2 border-r border-slate-50 text-[9px] text-slate-400">{getProp(o, ['RESPCONTROLPROD', 'RespControlProd', 'RESP_CONTROL_PROD'])}</td>
                  <td className="px-4 py-2 font-bold text-slate-300 uppercase text-[9px]">{getProp(o, ['MAQUINA', 'RECURSO'])}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSalidaGrid = (items: any[]) => (
    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-inner bg-slate-50/30">
      <div className="overflow-x-auto max-h-[400px]">
        <table className="w-full border-collapse text-center font-sans text-[10px]">
          <thead className="bg-slate-800 text-white uppercase font-black tracking-tighter text-[9px] sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left border-r border-white/5">Orden</th>
              <th className="px-4 py-3 text-left border-r border-white/5">Material / Descripción</th>
              <th className="px-2 py-3 border-r border-white/5 bg-slate-700">Ancho</th>
              <th className="px-2 py-3 border-r border-white/5 bg-slate-700">Largo</th>
              <th className="px-2 py-3 border-r border-white/5 bg-slate-700">Esp.</th>
              <th className="px-2 py-3 border-r border-white/5">Dens.</th>
              <th className="px-3 py-3 border-r border-white/5">Cant.</th>
              <th className="px-3 py-3 border-r border-white/5">Peso (Kg)</th>
              <th className="px-3 py-3 border-r border-white/5">Volumen</th>
              <th className="px-3 py-3 border-r border-white/5 text-indigo-300">T. Indiv (m)</th>
              <th className="px-3 py-3 border-r border-white/5 text-indigo-300">T. Total (H)</th>
              <th className="px-3 py-3 border-r border-white/5 text-emerald-400">Cargas</th>
              <th className="px-3 py-3 text-emerald-400"># SUB_Bloque</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono font-bold text-slate-600">
            {items.map((row, idx) => (
              <tr key={idx} className="hover:bg-white transition-colors bg-white/50">
                <td className="px-4 py-2 border-r border-slate-100 text-indigo-600">{row.orden}</td>
                <td className="px-4 py-2 border-r border-slate-100 text-left font-sans truncate max-w-[200px]">
                  <span className="text-slate-900 block font-mono">{row.material}</span>
                  <span className="text-slate-400 text-[8px] uppercase italic leading-none">{row.descripcion}</span>
                </td>
                <td className="px-2 py-2 border-r border-slate-100">{row.ancho.toFixed(1)}</td>
                <td className="px-2 py-2 border-r border-slate-100">{row.largo.toFixed(1)}</td>
                <td className="px-2 py-2 border-r border-slate-100 text-indigo-600">{row.esp.toFixed(1)}</td>
                <td className="px-2 py-2 border-r border-slate-100 text-slate-900 font-black">{row.dens}</td>
                <td className="px-3 py-2 border-r border-slate-100 text-slate-900">{row.cant}</td>
                <td className="px-3 py-2 border-r border-slate-100 text-slate-400">{row.peso.toFixed(2)}</td>
                <td className="px-3 py-2 border-r border-slate-100 text-slate-400">{row.volumen.toFixed(3)}</td>
                <td className="px-3 py-2 border-r border-slate-100 text-indigo-400">{row.tIndiv.toFixed(2)}</td>
                <td className="px-3 py-2 border-r border-slate-100 text-indigo-600">{row.tTotal.toFixed(2)}</td>
                <td className="px-3 py-2 border-r border-slate-100 text-emerald-600 font-black bg-emerald-50/10">{row.cargas}</td>
                <td className="px-3 py-2 text-emerald-600 font-black bg-emerald-50/10">{row.subBloques}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-slate-100 font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg"><Wind className="w-6 h-6" /></div>
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Corte Espuma</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Auditores Técnicos SAP | Auditoría Integral de Planta</p>
          </div>
        </div>
        <Button onClick={fetchData} variant="ghost" size="icon" disabled={isLoading} className="rounded-full hover:bg-slate-100 text-slate-400">
           <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-11 bg-slate-50/80 p-1.5 rounded-2xl border border-slate-100 mb-8">
          <TabsTrigger value="salida" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-indigo-600 rounded-xl">
            <FileSpreadsheet className="w-4 h-4" /> SALIDA DE DATOS
          </TabsTrigger>
          <TabsTrigger value="provisionales" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-slate-900 rounded-xl">
            <Package className="w-4 h-4" /> PROVISIONALES
          </TabsTrigger>
          <TabsTrigger value="proceso" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-slate-900 rounded-xl">
            <ShoppingCart className="w-4 h-4" /> ORDENES PROCESO
          </TabsTrigger>
          <TabsTrigger value="mmto" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-slate-900 rounded-xl">
            <Wrench className="w-4 h-4" /> MMTO
          </TabsTrigger>
        </TabsList>

        <TabsContent value="salida" className="animate-in fade-in duration-300 space-y-12">
          {isLoading ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-slate-200" />
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Compilando Reporte de Auditoría...</p>
            </div>
          ) : auditHierarchy.length === 0 ? (
            <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem]">
              <p className="text-slate-300 uppercase tracking-widest font-black italic">Sin datos técnicos consolidados</p>
            </div>
          ) : (
            auditHierarchy.map(([centro, categories]) => (
              <div key={centro} className="space-y-6">
                <div className="flex items-center gap-3 px-2 border-b-2 border-slate-100 pb-2">
                  <MapPin className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">{centro}</h3>
                </div>
                
                <Accordion type="multiple" className="space-y-4">
                  {Array.from(categories.entries()).map(([cat, items]) => (
                    <AccordionItem key={`${centro}-${cat}`} value={`${centro}-${cat}`} className="border-none">
                      <AccordionTrigger className="hover:no-underline bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 shadow-sm transition-all group data-[state=open]:rounded-b-none data-[state=open]:border-b-0">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-slate-800 rounded-lg text-white group-hover:scale-110 transition-transform">
                            <Box className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-left">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-700 block">{cat}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">{items.length} Materiales auditados</span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="bg-white p-4 rounded-b-2xl border border-slate-100 border-t-0 shadow-sm">
                         {renderSalidaGrid(items)}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="provisionales" className="animate-in fade-in duration-300 space-y-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
              <div className="w-2.5 h-5 rounded-sm bg-indigo-600" />
              <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">QUITO (UIO) — Almacén {UIO_ALMACEN_PROV}</h3>
            </div>
            {renderDataTable(provUIO)}
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
              <div className="w-2.5 h-5 rounded-sm bg-slate-400" />
              <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">GUAYAQUIL (GYE) — Almacén {GYE_ALMACEN_PROV}</h3>
            </div>
            {renderDataTable(provGYE)}
          </div>
        </TabsContent>

        <TabsContent value="proceso" className="animate-in fade-in duration-300 space-y-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
              <div className="w-2.5 h-5 rounded-sm bg-indigo-600" />
              <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">ORDENES PROCESO QUITO</h3>
            </div>
            {renderDataTable(procesoUIO)}
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
              <div className="w-2.5 h-5 rounded-sm bg-slate-400" />
              <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">ORDENES PROCESO GUAYAQUIL</h3>
            </div>
            {renderDataTable(procesoGYE)}
          </div>
        </TabsContent>

        <TabsContent value="mmto" className="animate-in fade-in duration-300">
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-[11px] text-center">
                <thead className="bg-slate-50 text-slate-400 font-black uppercase border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 text-left border-r border-slate-100">Centro</th>
                    <th className="px-6 py-4 text-left border-r border-slate-100">Recurso / Máquina</th>
                    <th className="px-6 py-4 text-left border-r border-slate-100">Inicio Programado</th>
                    <th className="px-6 py-4 text-left border-r border-slate-100">Fin Programado</th>
                    <th className="px-6 py-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-bold text-slate-600">
                  {mantenimientos.length === 0 ? (
                    <tr><td colSpan={5} className="py-20 text-slate-200 uppercase tracking-widest italic font-bold text-center">Sin mantenimientos vigentes</td></tr>
                  ) : (
                    mantenimientos.map((m, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 text-slate-400 text-left border-r border-slate-50">{m.PLANTA || '—'}</td>
                        <td className="px-6 py-3 text-slate-900 font-black text-left uppercase border-r border-slate-50">{m.ID_MAQUINA || '—'}</td>
                        <td className="px-6 py-3 text-left font-mono border-r border-slate-50">{m.FECHA_OT_PRG_INI || '—'}</td>
                        <td className="px-6 py-3 text-left font-mono border-r border-slate-50">{m.FECHA_OT_PRG_FIN || '—'}</td>
                        <td className="px-6 py-3 text-[9px] uppercase">{m.ESTADO || 'ACTIVO'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
