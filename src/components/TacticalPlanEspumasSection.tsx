
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
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
const UIO_ALMACEN = '1006';
const GYE_ALMACEN = '2006';

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
  
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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
      setOrdenesProceso(ferts.data?.data || ferts.data || []);
      setMantenimientos(maint.data || []);
      setTiemposCatalogo(times.data?.data || times.data || []);
      
      logger.log(`[Corte Espuma] Auditoría SAP completada.`, 'success');
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

  // --- FILTRADO TÉCNICO ---

  // Provisionales: Filtro por Almacén de Producción
  const provUIO = useMemo(() => ordenesProvisionales.filter(o => getProp(o, ['Almacen', 'ALMACEN']) === UIO_ALMACEN), [ordenesProvisionales]);
  const provGYE = useMemo(() => ordenesProvisionales.filter(o => getProp(o, ['Almacen', 'ALMACEN']) === GYE_ALMACEN), [ordenesProvisionales]);

  // Proceso: Filtro por Responsables
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

  // --- SALIDA DE DATOS: AGRUPADO POR CENTRO > CATEGORÍA ---
  const salidaDataHierarchical = useMemo(() => {
    const all = [...provUIO, ...provGYE]; // Basado en Provisionales según instrucción
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

  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpandedGroups(next);
  };

  const renderDataTable = (data: any[], type: 'PROVISIONALES' | 'PROCESO') => (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto max-h-[450px]">
        <table className="min-w-full divide-y divide-slate-100 text-[11px] text-center">
          <thead className="bg-slate-50 text-slate-500 uppercase font-black tracking-tighter border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 text-left border-r border-slate-100 w-32">Orden SAP</th>
              <th className="px-6 py-4 text-left border-r border-slate-100 w-32">Código</th>
              <th className="px-6 py-4 text-left border-r border-slate-200">Descripción de Material</th>
              <th className="px-4 py-4 border-r border-slate-100 w-24">Cantidad</th>
              <th className="px-4 py-4 border-r border-slate-100 w-32">Fecha SAP</th>
              <th className="px-4 py-4 border-r border-slate-100 w-24">Resp.</th>
              <th className="px-4 py-4 w-32">Máquina</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
            {data.length === 0 ? (
              <tr><td colSpan={7} className="py-20 text-slate-300 uppercase tracking-widest italic font-bold">Sin actividad reportada en SAP</td></tr>
            ) : (
              data.map((o, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3 text-left font-mono text-indigo-600 font-bold border-r border-slate-50">{getProp(o, ['ORDENPREVISIONAL', 'ORDEN']) || '—'}</td>
                  <td className="px-6 py-3 text-left font-mono font-bold text-slate-900 border-r border-slate-50">{cleanCode(getProp(o, ['MATERIAL', 'CodMaterial']))}</td>
                  <td className="px-6 py-3 text-left uppercase truncate max-w-[400px] border-r border-slate-100 text-slate-500">{getProp(o, ['NOMBRE', 'Material', 'DESCRIPCION'])}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-900 bg-slate-50/20 border-r border-slate-50">{getProp(o, ['CANTIDAD', 'CANTPROGRAMADA'])}</td>
                  <td className="px-4 py-3 font-mono text-slate-400 border-r border-slate-50">{getProp(o, ['FECHAINICIO', 'FECHA'])}</td>
                  <td className="px-4 py-3 border-r border-slate-50">
                    <span className="text-[9px] font-black text-slate-400 border border-slate-100 px-1.5 py-0.5 rounded uppercase">{getProp(o, ['RESPCONTROLPROD', 'RespControlProd', 'RESP_CONTROL_PROD'])}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-300 uppercase text-[9px]">{getProp(o, ['MAQUINA', 'RECURSO'])}</td>
                </tr>
              ))
            )}
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
          <div className="p-2 bg-indigo-50 rounded-xl"><Wind className="w-6 h-6 text-indigo-600" /></div>
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Corte Espuma</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestión Técnica SAP | UIO: 1006 / GYE: 2006</p>
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

        <TabsContent value="salida" className="animate-in fade-in duration-300 space-y-8">
          {isLoading ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-slate-200" />
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Generando Reporte de Ingeniería...</p>
            </div>
          ) : salidaDataHierarchical.length === 0 ? (
            <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem]">
              <p className="text-slate-300 uppercase tracking-widest font-black italic">Sin datos técnicos para procesar</p>
            </div>
          ) : (
            salidaDataHierarchical.map(([centro, categories]) => (
              <div key={centro} className="space-y-4">
                <div className="flex items-center gap-3 px-2">
                  <MapPin className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">{centro}</h3>
                </div>
                
                <div className="space-y-3">
                  {Array.from(categories.entries()).map(([cat, items]) => {
                    const groupKey = `${centro}-${cat}`;
                    const isExpanded = expandedGroups.has(groupKey);
                    return (
                      <div key={groupKey} className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-white">
                        <button 
                          onClick={() => toggleGroup(groupKey)}
                          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-all text-left"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-slate-900 rounded-lg text-white shadow-md">
                              <Box className="w-3 h-3" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">{cat}</span>
                            <Badge variant="secondary" className="bg-slate-100 text-slate-400 font-bold text-[9px] border-none">{items.length} ITEMS</Badge>
                          </div>
                          {isExpanded ? <Minus className="w-4 h-4 text-slate-300" /> : <Plus className="w-4 h-4 text-slate-300" />}
                        </button>

                        {isExpanded && (
                          <div className="overflow-x-auto max-h-[500px] border-t border-slate-50">
                            <table className="w-full border-collapse text-center font-sans text-[10px]">
                              <thead className="bg-slate-900 text-white uppercase font-black tracking-tighter text-[9px] sticky top-0 z-10">
                                <tr>
                                  <th className="px-4 py-3 text-left border-r border-white/5">Orden</th>
                                  <th className="px-4 py-3 text-left border-r border-white/5">Material / Descripción</th>
                                  <th className="px-2 py-3 border-r border-white/5 bg-slate-800">Ancho</th>
                                  <th className="px-2 py-3 border-r border-white/5 bg-slate-800">Largo</th>
                                  <th className="px-2 py-3 border-r border-white/5 bg-slate-800">Esp.</th>
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
                              <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
                                {items.map((row, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2 border-r border-slate-50 text-indigo-600 font-mono">{row.orden}</td>
                                    <td className="px-4 py-2 border-r border-slate-50 text-left truncate max-w-[200px]">
                                      <span className="text-slate-900 block font-mono">{row.material}</span>
                                      <span className="text-slate-400 text-[8px] uppercase italic">{row.descripcion}</span>
                                    </td>
                                    <td className="px-2 py-2 border-r border-slate-50 font-mono">{row.ancho.toFixed(1)}</td>
                                    <td className="px-2 py-2 border-r border-slate-50 font-mono">{row.largo.toFixed(1)}</td>
                                    <td className="px-2 py-2 border-r border-slate-50 font-mono text-indigo-600">{row.esp.toFixed(1)}</td>
                                    <td className="px-2 py-2 border-r border-slate-50 font-black text-slate-900">{row.dens}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono font-black text-slate-900">{row.cant}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono text-slate-400">{row.peso.toFixed(2)}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono text-slate-400">{row.volumen.toFixed(3)}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono text-indigo-400">{row.tIndiv.toFixed(2)}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono text-indigo-600">{row.tTotal.toFixed(2)}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-black text-emerald-600 bg-emerald-50/10">{row.cargas}</td>
                                    <td className="px-3 py-2 font-black text-emerald-600 bg-emerald-50/10">{row.subBloques}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="provisionales" className="animate-in fade-in duration-300 space-y-10">
          <div className="space-y-4">
            <h3 className="text-[11px] font-black text-indigo-600 uppercase flex items-center gap-2 px-1 tracking-widest">
              <div className="w-2 h-4 rounded-sm bg-indigo-600" /> CORTE ESPUMA QUITO (Alm. 1006)
            </h3>
            {renderDataTable(provUIO, 'PROVISIONALES')}
          </div>
          <div className="space-y-4">
            <h3 className="text-[11px] font-black text-slate-400 uppercase flex items-center gap-2 px-1 tracking-widest">
              <div className="w-2 h-4 rounded-sm bg-slate-400" /> CORTE ESPUMA GUAYAQUIL (Alm. 2006)
            </h3>
            {renderDataTable(provGYE, 'PROVISIONALES')}
          </div>
        </TabsContent>

        <TabsContent value="proceso" className="animate-in fade-in duration-300 space-y-10">
          <div className="space-y-4">
            <h3 className="text-[11px] font-black text-indigo-600 uppercase flex items-center gap-2 px-1 tracking-widest">
              <div className="w-2 h-4 rounded-sm bg-indigo-600" /> ORDENES PROCESO QUITO (UIO)
            </h3>
            {renderDataTable(procesoUIO, 'PROCESO')}
          </div>
          <div className="space-y-4">
            <h3 className="text-[11px] font-black text-slate-400 uppercase flex items-center gap-2 px-1 tracking-widest">
              <div className="w-2 h-4 rounded-sm bg-slate-400" /> ORDENES PROCESO GUAYAQUIL (GYE)
            </h3>
            {renderDataTable(procesoGYE, 'PROCESO')}
          </div>
        </TabsContent>

        <TabsContent value="mmto" className="animate-in fade-in duration-300">
          <Card className="rounded-3xl border border-slate-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-[11px] text-center">
                <thead className="bg-slate-50 text-slate-400 font-black uppercase border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 text-left border-r border-slate-50">Centro</th>
                    <th className="px-6 py-4 text-left border-r border-slate-50">Recurso / Máquina</th>
                    <th className="px-6 py-4 text-left border-r border-slate-50">Inicio Programado</th>
                    <th className="px-6 py-4 text-left border-r border-slate-50">Fin Programado</th>
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
                        <td className="px-6 py-3">
                          <Badge variant="outline" className="text-[9px] bg-slate-100 border-slate-200 text-slate-600 font-black uppercase rounded-lg">
                            {m.ESTADO || 'ACTIVO'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
