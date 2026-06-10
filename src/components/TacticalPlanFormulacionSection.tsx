'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FlaskConical, 
  Users, 
  Lock, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Activity,
  Database,
  History,
  Layers,
  MapPin
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from '@/components/ui/badge';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

// --- CONSTANTES OPERATIVAS ---
const BLOCK_LENGTH_METERS = 20;

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const formatNum = (val: any, decimals: number = 0): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

export const TacticalPlanFormulacionSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanFormulacion');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState<Date | null>(null);

  // Estados para Tiempos de Curado
  const [curadoRows, setCuradoRows] = useState<any[]>([]);
  const [isLoadingCurado, setIsLoadingCurado] = useState(false);

  useEffect(() => { 
    setMounted(true); 
    setViewDate(new Date());
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return name.includes('espuma') || name.includes('corte y laminado');
      });
      setGrupos(filteredGroups);
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);

      const [restrsRes, provsRes, timesRes] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getTiemposEnsamblado(1, 15000)
      ]);

      setRestricciones((restrsRes.data || []).filter((r: any) => groupsIds.includes(r.codigo_grupo)));
      setOrders(provsRes.data?.data || provsRes.data || []);
      setTiemposEnsamblado(timesRes.data?.data || timesRes.data || []);
      
      await fetchCurado();

    } catch (error) {
      console.error('Error init TacticalPlanFormulacion:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCurado = async () => {
    setIsLoadingCurado(true);
    try {
      const res = await serviciosService.getTiemposCuradoBloqueFormulado(1, 10000);
      const data = res.data || [];
      setCuradoRows(Array.isArray(data) ? data : []);
      inspector.captureVariable('curadoDataRaw', data);
    } catch (error) {
      console.error('Error cargando tiempos de curado:', error);
    } finally {
      setIsLoadingCurado(false);
    }
  };

  useEffect(() => {
    if (mounted) fetchData();
  }, [mounted]);

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null') dates.add(d.includes('T') ? d.split('T')[0] : d);
    });
    return dates;
  }, [ordenes, mounted]);

  const calendarDays = useMemo(() => {
    if (!mounted || !viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate, mounted]);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions: any = { dens: '—', ancho: '—', largo: '—', esp: '—', apertura: '—', tipo: '—' };
    const techPattern = catStr.match(/D(\d+)([a-zA-Z]+)/i);
    if (techPattern) {
      dimensions.dens = techPattern[1]; 
      dimensions.tipo = techPattern[2].toUpperCase(); 
    } else {
      const densMatch = desc.match(/D-?(\d+)/i);
      if (densMatch) dimensions.dens = densMatch[1];
      const tipoMatch = desc.match(/D-?\d+([a-zA-Z]+)/i);
      if (tipoMatch) dimensions.tipo = tipoMatch[1].toUpperCase();
    }

    const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
    if (dimMatch) {
      dimensions.ancho = dimMatch[1];
      dimensions.largo = dimMatch[2];
      if (dimMatch[3]) dimensions.esp = dimMatch[3];
    }
    const apertureRegex = /194\.5|206|219/;
    const apertureMatch = catStr.match(apertureRegex) || desc.match(apertureRegex);
    if (apertureMatch) dimensions.apertura = apertureMatch[0];
    
    return { code, desc, categoria: catStr, ...dimensions };
  };

  const filterData = (data: any[], centro: string, applyDateFilter: boolean = true) => {
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    if (relevantGroups.length === 0) return [];
    return data.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;
      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      if (centro === '1000' && itemAlmValue !== '1006') return false;
      if (centro === '2000' && itemAlmValue !== '2006') return false;
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = relevantGroups.some(g => {
        const respCodes = restricciones.filter(r => r.codigo_grupo === g.codigo_grupo && r.nombre_restriccion === 'RESPCTRLPROD')
          .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim())).filter(v => v !== '');
        return respCodes.length === 0 || respCodes.includes(itemResp);
      });
      if (!matchResp) return false;
      if (applyDateFilter) {
        const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
        if (selectedDate !== 'all' && itemDate !== selectedDate) return false;
      }
      return true;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restricciones, selectedDate]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restricciones, selectedDate]);

  const unifiedSummaryData = useMemo(() => {
    const groupsMap = new Map<string, { 
      fecha: string; maquina: string; dens: string; tipo: string; apertura: string;
      bloques1000: number; bloques2000: number; totalBloques: number;
      planReposicion: number;
    }>();

    const process = (data: any[], centerId: '1000' | '2000') => {
      data.forEach(o => {
        const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
        const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        const maquina = String(o.MAQUINA || o.RECURSO || 'SIN MÁQUINA').trim().toUpperCase();
        const info = extractMaterialInfo(o);
        const key = `${fecha}|${maquina}|${info.dens}|${info.tipo}|${info.apertura}`;
        const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
        const ancho = parseFloat(info.ancho) || 0;
        const esp = parseFloat(info.esp) || 0;
        const densValue = parseFloat(String(info.dens)) || 0;
        const usefulHeight = (densValue < 30) ? 103 : 85;
        const itemBloques = (qty * esp * ancho) / (usefulHeight * BLOCK_LENGTH_METERS * 100);

        if (!groupsMap.has(key)) {
          groupsMap.set(key, { fecha, maquina, dens: info.dens, tipo: info.tipo, apertura: info.apertura, bloques1000: 0, bloques2000: 0, totalBloques: 0, planReposicion: 0 });
        }
        const entry = groupsMap.get(key)!;
        if (centerId === '1000') entry.bloques1000 += itemBloques;
        else entry.bloques2000 += itemBloques;
        entry.totalBloques = entry.bloques1000 + entry.bloques2000;
        entry.planReposicion = Math.ceil(entry.totalBloques);
      });
    };

    process(provC1000, '1000');
    process(provC2000, '2000');

    return Array.from(groupsMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.maquina.localeCompare(b.maquina) || a.dens.localeCompare(b.dens));
  }, [provC1000, provC2000]);

  const totalsByAperture = useMemo(() => {
    const map = new Map<string, number>();
    unifiedSummaryData.forEach(row => {
      const ap = row.apertura || '—';
      map.set(ap, (map.get(ap) || 0) + row.planReposicion);
    });
    return Array.from(map.entries()).sort();
  }, [unifiedSummaryData]);

  // RESTAURACIÓN DE LA SEGMENTACIÓN SOLICITADA: F_BLOQ (CALLE) / F_BLOQ_M (BCALL)
  const curadoGroupsSummary = useMemo(() => {
    const fBloqRows: any[] = [];
    const fBloqMRows: any[] = [];
    
    curadoRows.forEach(row => {
      const estTras = String(row.estadoTras || row.Estado_Tras || row.ESTADO_TRAS || '').toUpperCase();
      const info = extractMaterialInfo({ MATERIAL: row.NomMaterial || row.CodMaterial || '', CATEGORIA: row.NomMaterial || '' });
      const enriched = { ...row, apertura: info.apertura };
      
      if (estTras.includes('BCALL')) {
        fBloqMRows.push(enriched);
      } else if (estTras.includes('CALLE')) {
        fBloqRows.push(enriched);
      } else {
        // Fallback si no tiene calle explícita, usar lógica de Stirling/Manual previa
        const maquinaRaw = String(row.Maquina || '').toUpperCase();
        if (maquinaRaw.includes('BLOQUE_M')) fBloqMRows.push(enriched);
        else fBloqRows.push(enriched);
      }
    });

    const getStats = (rows: any[]) => {
      const count = rows.length;
      const weight = rows.reduce((s, r) => s + safeNum(r.peso), 0);
      const apertureMap = new Map<string, number>();
      const callesSet = new Set<string>();

      rows.forEach(r => {
        const ap = r.apertura || '—';
        apertureMap.set(ap, (apertureMap.get(ap) || 0) + 1);
        const estTras = String(r.estadoTras || r.Estado_Tras || r.ESTADO_TRAS || '').toUpperCase();
        if (estTras.includes('CALLE')) {
          const match = estTras.match(/(?:B)?CALLE[\s_]*\d+/);
          if (match) callesSet.add(match[0]);
        }
      });

      return { count, weight, apertureMap, calles: Array.from(callesSet).sort() };
    };

    return [
      { id: 'f_bloq', label: 'F_BLOQ (RUTA CALLE - STIRLING)', rows: fBloqRows, stats: getStats(fBloqRows), color: 'bg-indigo-700' },
      { id: 'f_bloq_m', label: 'F_BLOQ_M (RUTA BCALL - MANUAL)', rows: fBloqMRows, stats: getStats(fBloqMRows), color: 'bg-orange-700' }
    ];
  }, [curadoRows]);

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Módulo de Formulación...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl"><FlaskConical className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Táctico Formulación</h2>
            <p className="text-xs text-gray-500 font-medium">Control Maestro de Bloques | Auditoría de Stock Curado por Ubicación</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-6 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Capacidad y Carga', i: LayoutDashboard }, 
            { v: 'curado', l: 'Stock Curado', i: History },
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Parámetros', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Catálogo Tiempos', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-8 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-xl"><CalendarIcon className="w-4 h-4 text-primary" /></div>
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider text-left">Horizonte de Carga</p>
                <h3 className="text-xs font-black text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'Plan Maestro Consolidado' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
                  <Filter className="w-3 h-3" /> Fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-3 font-sans">
                  {viewDate && (
                    <>
                      <div className="flex items-center justify-between mb-3 text-left">
                        <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                        <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6"><ChevronLeft className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6"><ChevronRight className="w-3 h-3" /></Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-y-1 text-center">
                        {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((d, i) => <div key={i} className="text-[8px] font-bold text-gray-300 uppercase py-1">{d}</div>)}
                        {calendarDays.map((day, idx) => {
                          if (!day) return <div key={idx} />;
                          const dStr = format(day, 'yyyy-MM-dd');
                          const sel = selectedDate === dStr;
                          return (
                            <button key={dStr} onClick={() => setSelectedDate(sel ? 'all' : dStr)} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
                              <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !sel ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                              {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1 w-1 h-1 bg-primary/40 rounded-full" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-primary h-7 mt-1 rounded-lg hover:bg-primary/5" onClick={() => setSelectedDate('all')}>Ver Todo</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-3 gap-4">
             {totalsByAperture.map(([ap, total]) => (
               <Card key={ap} className="p-4 border-none shadow-sm bg-indigo-50/50 flex flex-col items-center justify-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">Apertura {ap}</p>
                  <p className="text-2xl font-black text-indigo-700 font-mono">{total}</p>
                  <p className="text-[9px] font-bold text-indigo-300 uppercase mt-1">Bloques Totales</p>
               </Card>
             ))}
          </div>

          <div className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase flex items-center gap-2 px-1 tracking-wider text-left text-primary">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" /> Distribución Maestro de Producción por Máquina
            </h3>
            <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full border-collapse text-center font-sans">
                  <thead className="bg-[#1e293b] sticky top-0 z-10 text-[9px] font-black uppercase text-white border-b border-white/5">
                    <tr>
                      <th className="px-4 py-4 border-r border-white/5">Fecha</th>
                      <th className="px-4 py-4 border-r border-white/5 text-indigo-300">MÁQUINA</th>
                      <th className="px-4 py-4 border-r border-white/5">Densidad</th>
                      <th className="px-4 py-4 border-r border-white/5">Tipo</th>
                      <th className="px-4 py-4 border-r border-white/5 text-blue-200">Apertura</th>
                      <th className="px-4 py-4 border-r border-white/5 text-green-300">Carga Q (1000)</th>
                      <th className="px-4 py-4 border-r border-white/5 text-indigo-300">Carga G (2000)</th>
                      <th className="px-4 py-4 border-r border-white/5 text-orange-300 font-black">Total Bloques</th>
                      <th className="px-4 py-4 bg-emerald-500/20 text-emerald-300 font-black">Plan Reposición</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[10px]">
                    {unifiedSummaryData.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-400 border-r border-gray-50">{row.fecha}</td>
                        <td className="px-4 py-3 font-black text-indigo-700 border-r border-gray-50 uppercase">{row.maquina}</td>
                        <td className="px-4 py-3 font-bold text-gray-700 border-r border-gray-50">{row.dens}</td>
                        <td className="px-4 py-3 font-black text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                        <td className="px-4 py-3 font-bold text-blue-700 border-r border-gray-50">{row.apertura}</td>
                        <td className="px-4 py-3 font-mono font-bold text-green-700 border-r border-gray-50">{formatNum(row.bloques1000, 1)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-indigo-700 border-r border-gray-50">{formatNum(row.bloques2000, 1)}</td>
                        <td className="px-4 py-3 font-mono font-black text-orange-800 border-r border-gray-50">{formatNum(row.totalBloques, 1)}</td>
                        <td className="px-4 py-3 font-mono font-black text-emerald-600 bg-emerald-50/30">{String(row.planReposicion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="curado" className="space-y-12 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-gray-900 p-5 rounded-2xl border border-white/10 shadow-2xl">
            <div className="flex items-center gap-4 text-left">
              <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400"><History className="w-6 h-6" /></div>
              <div>
                <h3 className="text-md font-black text-white uppercase tracking-tight">Monitor Maestro de Bloques Curados</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Segmentación Logística: CALLE (f_bloq) vs BCALL (f_bloq_m)</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Total Inventario SAP</p>
              <p className="text-2xl font-black text-indigo-400 font-mono">{curadoRows.length}</p>
            </div>
          </div>

          {isLoadingCurado ? (
            <div className="py-32 text-center">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-indigo-500" />
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-6 animate-pulse">Sincronizando con SAP ERP...</p>
            </div>
          ) : (
            <div className="space-y-16">
              {curadoGroupsSummary.map((group) => (
                <div key={group.id} className="space-y-4">
                  <div className={cn("p-5 rounded-2xl border flex flex-col gap-4 text-white shadow-xl transition-all", group.color)}>
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-left">
                           <div className="p-2 bg-white/10 rounded-xl"><Layers className="w-6 h-6" /></div>
                           <div>
                              <h4 className="text-sm font-black uppercase tracking-widest">{group.label}</h4>
                              <p className="text-[10px] font-bold opacity-60 uppercase">Consolidación de Auditoría Técnica</p>
                           </div>
                        </div>
                        {group.stats.calles.length > 0 && (
                          <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-xl border border-white/5">
                             <MapPin className="w-3.5 h-3.5 text-white/70" />
                             <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">Ubicaciones Activas:</span>
                             <div className="flex gap-1">
                                {group.stats.calles.slice(0, 5).map(calle => (
                                  <Badge key={calle} variant="outline" className="bg-white/10 border-white/20 text-white text-[9px] font-black px-2 uppercase">{calle}</Badge>
                                ))}
                                {group.stats.calles.length > 5 && <span className="text-[8px] font-black opacity-50">+{group.stats.calles.length - 5}</span>}
                             </div>
                          </div>
                        )}
                     </div>
                     
                     <div className="flex gap-8 items-center bg-black/10 p-3 rounded-xl border border-white/5">
                        <div className="text-center min-w-[100px]">
                           <p className="text-[9px] font-black uppercase opacity-60">Bloques</p>
                           <p className="text-xl font-black font-mono">{group.stats.count}</p>
                        </div>
                        <div className="text-center min-w-[120px] border-l border-white/10">
                           <p className="text-[9px] font-black uppercase opacity-60">Peso (Kg)</p>
                           <p className="text-xl font-black font-mono">{group.stats.weight.toLocaleString()}</p>
                        </div>
                        <div className="text-left px-4 border-l border-white/10 flex-1">
                           <p className="text-[9px] font-black uppercase opacity-60 mb-1">Disponibilidad Aperturas</p>
                           <div className="flex flex-wrap gap-2">
                              {Array.from(group.stats.apertureMap.entries()).map(([ap, count]) => (
                                <Badge key={ap} variant="outline" className="bg-white/10 border-white/20 text-white text-[9px] font-black px-3 py-1">
                                   {ap}: {count} un.
                                </Badge>
                              ))}
                           </div>
                        </div>
                     </div>
                  </div>

                  <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                    <div className="overflow-x-auto max-h-[450px]">
                      <table className="w-full border-collapse text-center font-sans text-[10px]">
                        <thead className="bg-[#f1f5f9] sticky top-0 z-10 text-slate-500 uppercase font-black tracking-tight border-b border-gray-200">
                          <tr>
                            <th className="px-3 py-3 border-r border-gray-100">ID bloque</th>
                            <th className="px-3 py-3 border-r border-gray-100">fecha</th>
                            <th className="px-3 py-3 border-r border-gray-100">ESTADO</th>
                            <th className="px-3 py-3 border-r border-gray-100">orden</th>
                            <th className="px-3 py-3 border-r border-gray-100">CodMaterial</th>
                            <th className="px-4 py-3 border-r border-gray-100 text-left">NomMaterial</th>
                            <th className="px-3 py-3 border-r border-gray-100 bg-blue-50/50 text-blue-900">APERTURA</th>
                            <th className="px-2 py-3 border-r border-gray-100">C.Proc</th>
                            <th className="px-3 py-3 border-r border-gray-100 text-orange-800">peso</th>
                            <th className="px-3 py-3 border-r border-gray-100">est.2</th>
                            <th className="px-3 py-3 border-r border-gray-100">CodBloque</th>
                            <th className="px-3 py-3 border-r border-gray-100">operador</th>
                            <th className="px-3 py-3 border-r border-gray-100">Maquina</th>
                            <th className="px-3 py-3 border-r border-gray-100 text-indigo-700 bg-indigo-50/30">estadoTras</th>
                            <th className="px-3 py-3 border-r border-gray-100">Stock</th>
                            <th className="px-3 py-3">Dens</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-bold">
                          {group.rows.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-2 py-2 border-r border-gray-100 text-gray-400 font-mono">{String(row.Idbloque)}</td>
                              <td className="px-2 py-2 border-r border-gray-100 text-gray-500">{String(row.fecha).split('T')[0]}</td>
                              <td className="px-2 py-2 border-r border-gray-100 uppercase text-[8px] text-gray-400">{String(row.ESTADO || '—')}</td>
                              <td className="px-2 py-2 border-r border-gray-100 text-indigo-600 font-mono">{String(row.orden)}</td>
                              <td className="px-2 py-2 border-r border-gray-100 font-mono text-slate-800">{String(row.CodMaterial)}</td>
                              <td className="px-3 py-2 border-r border-gray-100 text-left uppercase text-slate-500 truncate max-w-[150px]">{String(row.NomMaterial)}</td>
                              <td className="px-3 py-2 border-r border-gray-100 font-black text-blue-700 bg-blue-50/5">{row.apertura}</td>
                              <td className="px-1 py-2 border-r border-gray-100 text-gray-400">{String(row.corridaproceso || '1')}</td>
                              <td className="px-2 py-2 border-r border-gray-100 font-mono text-orange-700 font-black">{formatNum(row.peso, 1)}</td>
                              <td className="px-2 py-2 border-r border-gray-100 text-[8px] text-gray-400">{String(row.estado2 || 'CR')}</td>
                              <td className="px-2 py-2 border-r border-gray-100 font-mono text-purple-700">{String(row.CodBloque)}</td>
                              <td className="px-2 py-2 border-r border-gray-100 text-gray-400">{String(row.operador)}</td>
                              <td className="px-2 py-2 border-r border-gray-100 font-black text-[9px] text-indigo-700 uppercase">{String(row.Maquina || '—')}</td>
                              <td className="px-2 py-2 border-r border-gray-100">
                                 <Badge variant="outline" className={cn("text-[8px] font-black uppercase tracking-widest", (row.estadoTras || '').includes('CALLE') ? "bg-indigo-600 text-white" : "text-gray-400")}>
                                    {String(row.estadoTras || '—')}
                                 </Badge>
                              </td>
                              <td className="px-2 py-2 border-r border-gray-100 text-gray-900 font-mono">{formatNum(row.CantidadStock || 1)}</td>
                              <td className="px-2 py-2 text-blue-700 font-black">{String(row.Densidad || '—')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-6">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                <Badge className="bg-gray-100 text-gray-600 mb-2 font-bold text-[9px] uppercase">PLANTA {g.centro}</Badge>
                <h4 className="font-bold text-gray-800 uppercase text-sm">{g.nombre_grupo}</h4>
                <p className="text-[9px] font-mono text-gray-400 mt-2">ID: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-[#bde0fe] text-[10px] font-black uppercase text-slate-800 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-gray-100">Parámetro Técnico</th>
                  <th className="px-6 py-5 border-r border-gray-100">Valor</th>
                  <th className="px-6 py-5 text-left">Descripción Operativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px] font-bold">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 text-gray-500 border-r border-gray-100 uppercase text-left">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-gray-100">
                      <Badge variant="outline" className="font-mono text-indigo-700 border-indigo-200 bg-indigo-50/50">{r.valor_restriccion}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-10">
          {[ 
            { t: 'Planta 1000 - Quito', d: provC1000, id: '1000', c: 'text-green-700', b: 'bg-green-600' }, 
            { t: 'Planta 2000 - Guayaquil', d: provC2000, id: '2000', c: 'text-indigo-700', b: 'bg-indigo-600' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1 text-left", center.c)}>
                <div className={cn("w-2 h-2 rounded-full", center.b)} /> {center.t} ({center.d.length} órdenes)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full border-collapse text-center font-sans">
                    <thead className="bg-[#bde0fe] sticky top-0 z-10 text-[9px] font-black uppercase text-slate-800 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-gray-100">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-100">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-100">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-100">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/50 text-blue-900 font-black uppercase">APERTURA</th>
                        <th className="px-3 py-4 border-r border-gray-100">Cant.</th>
                        <th className="px-3 py-4 border-r border-gray-100">Máquina</th>
                        <th className="px-3 py-4">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[10px]">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        const maquina = String(o.MAQUINA || o.Maquina || o.RECURSO || '—').trim();
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-2 text-gray-500 border-r border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                            <td className="px-3 py-2 font-mono font-bold text-primary border-r border-gray-100">{info.code}</td>
                            <td className="px-3 py-2 text-left border-r border-gray-50 truncate max-w-[200px] uppercase font-bold text-gray-600">{info.desc}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-black text-gray-400">{info.dens}</td>
                            <td className="px-2 py-2 border-r border-gray-100 text-gray-400 font-mono">{info.ancho}</td>
                            <td className="px-2 py-2 border-r border-gray-100 text-gray-400 font-mono">{info.largo}</td>
                            <td className="px-2 py-2 border-r border-gray-100 text-gray-400 font-mono">{info.esp}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-black text-blue-700 bg-blue-50/5">{info.apertura}</td>
                            <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-100">{String(o.CANTIDAD || o.CANTPROGRAMADA || 0)}</td>
                            <td className="px-3 py-2 font-black text-indigo-700 border-r border-gray-100 uppercase">{maquina}</td>
                            <td className="px-3 py-2 font-bold text-gray-200">{o.Almacen || o.ALMACEN || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-[11px] font-bold text-center">
                <thead className="bg-[#1e293b] text-white sticky top-0 z-10 uppercase font-black tracking-widest text-[9px]">
                  <tr>
                    <th className="px-5 py-4 border-r border-white/5 text-left">Material</th>
                    <th className="px-5 py-4 border-r border-white/5 text-left">Descripción Técnica</th>
                    <th className="px-4 py-4 border-r border-white/5">Línea</th>
                    <th className="px-4 py-4 text-teal-400">Estándar (Min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tiemposEnsamblado.map((t, i) => {
                    const info = extractMaterialInfo(t);
                    return (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-primary border-r border-gray-50 text-left">{info.code}</td>
                        <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[280px]">{info.desc}</td>
                        <td className="px-4 py-3 border-r border-gray-100 font-bold text-gray-400 uppercase">{t.Linea || t.PuestoTrabajoLinea || '—'}</td>
                        <td className="px-4 py-3 font-mono text-teal-600 bg-teal-50/5">{(t.Tiempo_Min || t.Tiempo || 0).toFixed(4)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-600" />
        <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
          Nota: Auditoría íntegra basada en el método de explosión jerárquica multinivel de SAP.
        </p>
      </div>
    </div>
  );
};