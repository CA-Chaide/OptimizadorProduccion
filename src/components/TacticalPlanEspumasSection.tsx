'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Wind, 
  Package, 
  Loader2, 
  Clock, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Wrench,
  RefreshCw,
  ShoppingCart,
  MapPin
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { logger } from '@/services/LogService';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * --- CONSTANTES DE INGENIERÍA PLANTA ESPUMAS ---
 */
const CARRUSEL_DIAMETER_CM = 320;
const CIRCUMFERENCE = Math.PI * CARRUSEL_DIAMETER_CM;
const MANIPULATION_FACTOR = 1.05; 
const EFFECTIVE_GAP_CM = 30 * MANIPULATION_FACTOR; 
const MAX_STACK_HEIGHT_CM = 200; 
const SECONDS_PER_LOAD_VUELTA = 300; 
const SECONDS_PER_MANEUVER_DESC = 45; 

// --- HELPERS TÉCNICOS ---
const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const parseDimensionsEnhanced = (desc: string) => {
  const d = String(desc || '').toUpperCase();
  const densMatch = d.match(/D(\d+)/);
  const densidad = densMatch ? densMatch[1] : '—';
  
  if (d.includes('CV')) return { densidad, distancia: 60, altura: 206, espesor: 3.5, ancho: 194.5, largo: 204 };
  
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
  const ancho = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const largo = dimMatch ? parseFloat(dimMatch[2]) : 0;
  const espesor = dimMatch && dimMatch[3] ? parseFloat(dimMatch[3]) : 1.2;
  
  let alturaFinal = ancho;
  if (ancho === 204 && espesor <= 1.2) alturaFinal = 206;
  
  let distancia = 100; 
  if (espesor === 1.0) distancia = 110;
  else if (espesor === 3.5) distancia = 60;
  else if (espesor === 1.2) distancia = 100;
  
  return { densidad, distancia, altura: alturaFinal, espesor, ancho, largo };
};

const calculateMTTOCapacity = (start: string, end: string): string => {
  if (!start || !end) return '0.0';
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '0.0';
  const diffHrs = (e.getTime() - s.getTime()) / (1000 * 60 * 60);
  return Math.max(0, diffHrs).toFixed(1);
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ordenes');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState(new Date());

  useEffect(() => {
    setMounted(true);
    setSelectedDates(new Set([format(new Date(), 'yyyy-MM-dd')]));
  }, []);

  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    const dims = parseDimensionsEnhanced(desc);
    return { code, desc, ...dims };
  }, []);

  const calculateEngineering = useCallback((o: any) => {
    const info = extractMaterialInfo(o);
    const qty = safeNum(o.CANTIDAD || o.CANTPROGRAMADA || 0);
    const densV = parseFloat(info.densidad) || 0;
    
    // Nro de bloques (apilamiento máximo 200cm)
    const singleBlockH = (densV < 30) ? 103 : 85;
    const sheetsPerStack = info.espesor > 0 ? Math.floor(Math.min(MAX_STACK_HEIGHT_CM, singleBlockH * 2) / info.espesor) : 1;
    const subblocks = sheetsPerStack > 0 ? Math.ceil(qty / sheetsPerStack) : 0;
    
    // Nro de cargas (Carrusel)
    const sbPerLoad = info.ancho > 0 ? Math.floor(CIRCUMFERENCE / (info.ancho + EFFECTIVE_GAP_CM)) : 1;
    const loads = sbPerLoad > 0 ? Math.ceil(subblocks / sbPerLoad) : 0;
    
    // Tiempos
    const matchTime = tiemposEnsamblado.find(t => cleanCode(t.CodMaterial || t.cod_material).slice(-8) === info.code);
    const sapSecPerUnit = safeNum(matchTime?.Tiempo || matchTime?.tiempo || 0);
    const totalTimeSec = (loads * SECONDS_PER_LOAD_VUELTA) + ((qty / 3) * SECONDS_PER_MANEUVER_DESC) + (qty * sapSecPerUnit);
    
    return { 
      ...info, 
      subblocks, 
      loads, 
      hours: totalTimeSec / 3600, 
      indivMin: qty > 0 ? (totalTimeSec / qty) / 60 : 0, 
      qty
    };
  }, [extractMaterialInfo, tiemposEnsamblado]);

  const provFiltradas = useMemo(() => {
    return ordenes.filter(o => {
      const itemAlmValue = String(o.ALMACEN || o.Almacen || '').trim();
      if (itemAlmValue !== '1006' && itemAlmValue !== '2006') return false; 
      const itemDateFull = String(o.FECHA || o.FECHAINICIO || '').trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenes, selectedDates]);

  const fertsFiltradasPorFecha = useMemo(() => {
    return ordenesFert.filter(o => {
      const d = String(o.FECHA || o.FECHAINICIO || '').trim();
      if (!d || d === 'null') return false;
      const normalized = d.includes('T') ? d.split('T')[0] : d;
      return selectedDates.size === 0 || selectedDates.has(normalized);
    });
  }, [ordenesFert, selectedDates]);

  const initData = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return name.includes('espuma') || name.includes('corte y laminado');
      });
      setGrupos(filteredGroups);
      const gIds = filteredGroups.map(g => g.codigo_grupo);

      const [restrs, provs, ferts, times, maint] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 25000),
        serviciosService.getOrdenesFert(1, 20000),
        serviciosService.getTiemposEnsamblado(1, 15000),
        serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] }))
      ]);

      setRestriccionesArray((restrs.data || []).filter((r: any) => gIds.includes(r.codigo_grupo)));
      setOrders(provs.data?.data || provs.data || []);
      setOrdersFert(ferts.data?.data || ferts.data || []);
      setTiemposEnsamblado(times.data?.data || times.data || []);
      setMantenimientos(maint.data || []);
      
      logger.log(`[Corte Espuma] Sincronización completa. ${provs.data?.length || 0} órdenes cargadas.`);
    } catch (e) {
      console.error('Error init:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (mounted) initData(); }, [mounted, initData]);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    [...ordenes, ...ordenesFert].forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null') dates.add(d.includes('T') ? d.split('T')[0] : d);
    });
    return dates;
  }, [ordenes, ordenesFert]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  const renderRoot = (content: React.ReactNode) => (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Auditoría SAP | Ingeniería de Carrusel v4.2</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={initData} disabled={isLoading} variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} ACTUALIZAR
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
                <CalendarIcon className="w-3 h-3 text-primary" /> {selectedDates.size === 0 ? 'Plan Maestro' : `${selectedDates.size} Días`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
              <div className="bg-white p-4 font-sans text-left">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                  <div className="flex gap-1 bg-gray-50 p-1 rounded-lg">
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6"><ChevronLeft className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6"><ChevronRight className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center">
                  {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[8px] font-bold text-gray-300 uppercase py-1">{d}</div>)}
                  {calendarDays.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const dStr = format(day, 'yyyy-MM-dd');
                    const sel = selectedDates.has(dStr);
                    return (
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); sel ? n.delete(dStr) : n.add(dStr); setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
                        <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !sel ? "text-slate-200" : "")}>{format(day, 'd')}</span>
                        {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1.5 w-1 h-1 bg-primary/40 rounded-full" />}
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-primary h-8 mt-3 rounded-lg hover:bg-primary/5 tracking-widest" onClick={() => setSelectedDates(new Set())}>Ver Todo el Plan</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {!mounted || isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Sincronizando con SAP...</p>
        </div>
      ) : content}
    </div>
  );

  const content = (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid grid-cols-3 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
        {[ 
          { v: 'ordenes', l: 'Provisionales', i: Package },
          { v: 'ordenesFert', l: 'FERT', i: ShoppingCart },
          { v: 'mantenimiento', l: 'MMTO', i: Wrench }
        ].map(tab => (
          <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[8px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <tab.i className="w-3.5 h-3.5" /> {tab.l}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="ordenes" className="animate-in fade-in duration-300">
        <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-[10px] text-center">
              <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-widest border-b border-gray-100">
                <tr>
                  <th className="px-3 py-4 border-r border-gray-50 text-left">Orden / Material</th>
                  <th className="px-2 py-4">ANC</th>
                  <th className="px-2 py-4">LRG</th>
                  <th className="px-2 py-4">ESP</th>
                  <th className="px-2 py-4">Dens.</th>
                  <th className="px-3 py-4 font-black text-gray-900">Cant.</th>
                  <th className="px-3 py-4 text-amber-600">T. Tot (H)</th>
                  <th className="px-3 py-4">Cargas</th>
                  <th className="px-3 py-4">Alm.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold">
                {provFiltradas.length === 0 ? (
                  <tr><td colSpan={9} className="py-24 text-center text-slate-200 uppercase tracking-widest italic">Sin órdenes para esta fecha</td></tr>
                ) : (
                  provFiltradas.map((o, idx) => {
                    const eng = calculateEngineering(o);
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-left">
                          <div className="font-black text-indigo-600">{eng.code}</div>
                          <div className="text-[8px] text-slate-400 truncate max-w-[150px]">{eng.desc}</div>
                        </td>
                        <td className="px-2 py-2 text-slate-400">{eng.ancho}</td>
                        <td className="px-2 py-2 text-slate-400">{eng.largo}</td>
                        <td className="px-2 py-2 font-black">{eng.espesor}</td>
                        <td className="px-2 py-2 text-indigo-700">{eng.densidad}</td>
                        <td className="px-3 py-2 font-black text-slate-900 text-sm">{eng.qty.toLocaleString()}</td>
                        <td className="px-3 py-2 text-amber-600">{eng.hours.toFixed(1)}</td>
                        <td className="px-3 py-2 text-blue-400">{eng.loads}</td>
                        <td className="px-3 py-2 text-slate-200">{o.ALMACEN || o.Almacen || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="ordenesFert" className="animate-in fade-in duration-300">
        <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-[10px] text-center">
              <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-widest border-b border-gray-100">
                <tr>
                  <th className="px-3 py-4 border-r border-gray-50 text-left">Orden FERT / Material</th>
                  <th className="px-2 py-4">ANC</th>
                  <th className="px-2 py-4">LRG</th>
                  <th className="px-2 py-4">ESP</th>
                  <th className="px-2 py-4">Dens.</th>
                  <th className="px-3 py-4 font-black text-gray-900">Cant.</th>
                  <th className="px-3 py-4 text-amber-600">T. Tot (H)</th>
                  <th className="px-3 py-4">Cargas</th>
                  <th className="px-3 py-4">Alm.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold">
                {fertsFiltradasPorFecha.length === 0 ? (
                  <tr><td colSpan={9} className="py-24 text-center text-slate-200 uppercase tracking-widest italic">Sin órdenes FERT para esta fecha</td></tr>
                ) : (
                  fertsFiltradasPorFecha.map((o, idx) => {
                    const eng = calculateEngineering(o);
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-left">
                          <div className="font-black text-indigo-600">{eng.code}</div>
                          <div className="text-[8px] text-slate-400 truncate max-w-[150px]">{eng.desc}</div>
                        </td>
                        <td className="px-2 py-2 text-slate-400">{eng.ancho}</td>
                        <td className="px-2 py-2 text-slate-400">{eng.largo}</td>
                        <td className="px-2 py-2 font-black">{eng.espesor}</td>
                        <td className="px-2 py-2 text-indigo-700">{eng.densidad}</td>
                        <td className="px-3 py-2 font-black text-slate-900 text-sm">{eng.qty.toLocaleString()}</td>
                        <td className="px-3 py-2 text-amber-600">{eng.hours.toFixed(1)}</td>
                        <td className="px-3 py-2 text-blue-400">{eng.loads}</td>
                        <td className="px-3 py-2 text-slate-200">{o.ALMACEN || o.Almacen || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </TabsContent>
      
      <TabsContent value="mantenimiento" className="animate-in fade-in duration-300">
        <Card className="rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden bg-white">
          <table className="w-full border-collapse text-[10px]">
            <thead className="bg-[#fef3c7] text-amber-900 font-black uppercase border-b border-amber-200">
              <tr>
                <th className="px-6 py-4">PLANTA</th>
                <th className="px-6 py-4">RECURSO</th>
                <th className="px-6 py-4 text-left">FECHA INICIO</th>
                <th className="px-6 py-4 text-left">FECHA FIN</th>
                <th className="px-6 py-4">HORAS MTTO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 font-bold">
              {mantenimientos.length === 0 ? (
                <tr><td colSpan={5} className="py-20 text-center text-slate-200 uppercase tracking-widest italic">Sin tareas de mantenimiento registradas</td></tr>
              ) : (
                mantenimientos.map((m, i) => (
                  <tr key={i} className="hover:bg-amber-50/20">
                    <td className="px-6 py-3 text-slate-400">{String(m.PLANTA || '—')}</td>
                    <td className="px-6 py-3 text-indigo-900 font-black">{String(m.ID_MAQUINA || '—')}</td>
                    <td className="px-6 py-3 text-left font-mono text-slate-400">{m.FECHA_OT_PRG_INI || m.FECHA_INI || '—'}</td>
                    <td className="px-6 py-3 text-left font-mono text-slate-400">{m.FECHA_OT_PRG_FIN || m.FECHA_FIN || '—'}</td>
                    <td className="px-6 py-3 font-black text-amber-600 bg-amber-50/10">{calculateMTTOCapacity(m.FECHA_OT_PRG_INI || m.FECHA_INI, m.FECHA_OT_PRG_FIN || m.FECHA_FIN)}h</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </TabsContent>
    </Tabs>
  );

  return renderRoot(content);
};
