'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FlaskConical, Users, Lock, Package, Loader2, Clock, LayoutDashboard, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// --- CONSTANTES TÉCNICAS ---
const MACHINE_RADIO_CM = 350;    
const SECONDS_LOAD_BLOCK = 300;   
const SECONDS_REPETITION = 45;    
const SECONDS_CART_SWAP = 60;     

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
  const [viewDate, setViewDate] = useState(new Date());

  useEffect(() => { setMounted(true); }, []);

  const fetchGruposRelevantes = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return name.includes('espuma') || name.includes('corte y laminado') || name.includes('formulación');
      });
      setGrupos(filtered);
      return filtered;
    } catch (error) {
      return [];
    }
  };

  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
      const res = await restriccionService.getAll();
      const filtered = (res.data || []).filter(r => gruposIds.includes(r.codigo_grupo));
      setRestricciones(filtered);
      return filtered;
    } catch (error) {
      return [];
    }
  };

  const fetchOrdenes = async () => {
    try {
      const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      const data = resProv.data?.data || resProv.data || [];
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
    }
  };

  const fetchTiemposEnsamblado = async (filteredGroups: Grupo[]) => {
    try {
      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) allTiempos.push(...data);
      }
      setTiemposEnsamblado(allTiempos);
    } catch (error) {
      console.error('Error cargando tiempos:', error);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const initData = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGruposRelevantes();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await Promise.all([
        fetchRestricciones(groupsIds),
        fetchOrdenes(),
        fetchTiemposEnsamblado(filteredGroups)
      ]);
      setIsLoading(false);
    };
    initData();
  }, [mounted]);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions = { dens: '—', ancho: '—', largo: '—', esp: '—', apertura: '—' };
    const densMatch = desc.match(/D-?(\d+)/i);
    if (densMatch) dimensions.dens = densMatch[1];
    const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
    if (dimMatch) {
      dimensions.ancho = dimMatch[1];
      dimensions.largo = dimMatch[2];
      if (dimMatch[3]) dimensions.esp = dimMatch[3];
    }
    const apertureRegex = /194\.5|206|219/;
    const descApertureMatch = desc.match(apertureRegex);
    if (descApertureMatch) dimensions.apertura = descApertureMatch[0];
    
    return { code, desc, ...dimensions };
  };

  const calculateCargasLogic = (totalSubblocks: number, ancho: number, largo: number) => {
    if (ancho <= 0 || largo <= 0 || totalSubblocks <= 0) return { subbloquesPorCarga: 0, totalCargas: 0 };
    const innerRadius = MACHINE_RADIO_CM - largo;
    if (innerRadius <= 0) return { subbloquesPorCarga: 1, totalCargas: Math.ceil(totalSubblocks) };
    const innerCircumference = 2 * Math.PI * innerRadius;
    const subbloquesPorCarga = Math.max(1, Math.floor(innerCircumference / ancho));
    const totalCargas = Math.ceil(totalSubblocks / subbloquesPorCarga);
    return { subbloquesPorCarga, totalCargas };
  };

  const filterData = (data: any[], centro: string, applyDateFilter: boolean = true) => {
    if (!data || data.length === 0) return [];
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
  
  const calculateSummary = (data: any[]) => {
    const groupsMap = new Map<string, { fecha: string; dens: string; apertura: string; units: number; subbloques: number; bloques20m: number; cargas: number; timeLog: number }>();
    data.forEach(o => {
      const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
      const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      const info = extractMaterialInfo(o);
      const key = `${fecha}|${info.dens}|${info.apertura}`;
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      const ancho = parseFloat(info.ancho) || 0;
      const largo = parseFloat(info.largo) || 0;
      const esp = parseFloat(info.esp) || 0;
      const densValue = parseFloat(info.dens) || 0;
      const usefulHeight = isNaN(densValue) ? 103 : (densValue < 30 ? 103 : 85);
      const itemSubbloques = (qty * esp) / usefulHeight;
      const itemBloques20m = (ancho * itemSubbloques) / 2000;
      const { totalCargas } = calculateCargasLogic(itemSubbloques, ancho, largo);
      const physicalBlocksCount = Math.ceil(itemBloques20m);
      const tCarga = physicalBlocksCount * SECONDS_LOAD_BLOCK;
      const tDescarga = Math.ceil(qty / (esp > 10 ? 4 : 3)) * SECONDS_REPETITION;
      const tCoches = Math.ceil(physicalBlocksCount / 2) * SECONDS_CART_SWAP;
      const itemTimeLog = (tCarga + tDescarga + tCoches) / 3600;
      if (!groupsMap.has(key)) groupsMap.set(key, { fecha, dens: info.dens, apertura: info.apertura, units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 });
      const entry = groupsMap.get(key)!;
      entry.units += qty; entry.subbloques += itemSubbloques; entry.bloques20m += itemBloques20m; entry.cargas += totalCargas; entry.timeLog += itemTimeLog;
    });
    return Array.from(groupsMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.dens.localeCompare(b.dens) || a.apertura.localeCompare(b.apertura));
  };

  const summaryData1000 = useMemo(() => calculateSummary(provC1000), [provC1000]);
  const summaryData2000 = useMemo(() => calculateSummary(provC2000), [provC2000]);

  // CORRECCIÓN DEL ERROR: Initial value must not reference acc or row
  const summaryTotals1000 = useMemo(() => summaryData1000.reduce((acc, row) => ({ 
    units: acc.units + row.units, 
    subbloques: acc.subbloques + row.subbloques, 
    bloques20m: acc.bloques20m + row.bloques20m, 
    cargas: acc.cargas + row.cargas, 
    timeLog: acc.timeLog + row.timeLog 
  }), { units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 }), [summaryData1000]);

  const summaryTotals2000 = useMemo(() => summaryData2000.reduce((acc, row) => ({ 
    units: acc.units + row.units, 
    subbloques: acc.subbloques + row.subbloques, 
    bloques20m: acc.bloques20m + row.bloques20m, 
    cargas: acc.cargas + row.cargas, 
    timeLog: acc.timeLog + row.timeLog 
  }), { units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 }), [summaryData2000]);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl"><FlaskConical className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Táctico Formulación</h2>
            <p className="text-xs text-gray-500 font-medium">Control de Carga y Evaluación de Órdenes</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Resumen', i: LayoutDashboard }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Restricciones', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-8 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-primary/10 rounded-xl"><CalendarIcon className="w-4 h-4 text-primary" /></div>
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Horizonte de Carga</p>
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'Plan Maestro Consolidado' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl border-gray-200 hover:bg-white hover:border-primary/50 gap-2 font-bold text-[10px] uppercase transition-all shadow-sm">
                  <Filter className="w-3 h-3" /> Fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-3 font-sans">
                  <div className="flex items-center justify-between mb-3 text-left">
                    <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                    <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6 hover:bg-white hover:shadow-sm"><ChevronLeft className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6 hover:bg-white hover:shadow-sm"><ChevronRight className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-y-1 text-center mb-2">
                    {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((day, idx) => <div key={`cal-head-${idx}`} className="text-[8px] font-bold text-gray-300 uppercase py-1">{day}</div>)}
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={`cal-pad-${idx}`} className="p-1" />;
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const isSelected = selectedDate === dateStr;
                      return (
                        <button key={dateStr} onClick={() => setSelectedDate(isSelected ? 'all' : dateStr)} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", isSelected ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
                          <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dateStr) && !isSelected ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                          {datesWithOrders.has(dateStr) && !isSelected && <div className="absolute bottom-1 w-1 h-1 bg-primary/40 rounded-full" />}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-primary h-7 mt-1 rounded-lg hover:bg-primary/5" onClick={() => setSelectedDate('all')}>Ver Todo</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase flex items-center gap-2 px-1 tracking-wider text-left text-green-700">
              <div className="w-2 h-2 rounded-full bg-green-600" /> Planta 1000 - Quito (Almacén 1006)
            </h3>
            <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full border-collapse text-center font-sans">
                  <thead className="bg-gray-100/80 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 border-r border-gray-100">Fecha</th>
                      <th className="px-4 py-3 border-r border-gray-100">Densidad</th>
                      <th className="px-4 py-3 border-r border-gray-100 bg-blue-50/50 text-blue-800">Apertura</th>
                      <th className="px-4 py-3 border-r border-gray-100">Unidades</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-purple-700">Nro. Subbloque</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-orange-800 font-bold">Nro. Bloque Formulado</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-purple-800 font-bold">Nro. Cargas Subbloque</th>
                      <th className="px-4 py-3 text-center text-teal-700 bg-teal-50/20">Tiempo Operativo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px]">
                    {summaryData1000.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-2 font-medium text-gray-400 border-r border-gray-50">{row.fecha}</td>
                        <td className="px-4 py-2 font-bold text-gray-700 border-r border-gray-50">{row.dens}</td>
                        <td className="px-4 py-2 font-bold text-blue-700 border-r border-gray-50 bg-blue-50/5">{row.apertura}</td>
                        <td className="px-4 py-2 font-mono border-r border-gray-50">{row.units.toLocaleString()}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50">{row.subbloques.toFixed(1)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-orange-800 border-r border-gray-50 bg-orange-50/5">{row.bloques20m.toFixed(1)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50 bg-purple-50/5">{Math.ceil(row.cargas)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-teal-600 text-center bg-teal-50/5">{row.timeLog.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-800 text-white font-bold text-[11px]">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right uppercase">Total Planta 1000:</td>
                      <td className="px-4 py-2 font-mono">{summaryTotals1000.units.toLocaleString()}</td>
                      <td className="px-4 py-2 font-mono">{summaryTotals1000.subbloques.toFixed(1)}</td>
                      <td className="px-4 py-2 font-mono">{summaryTotals1000.bloques20m.toFixed(1)}</td>
                      <td className="px-4 py-2 font-mono">{Math.ceil(summaryTotals1000.cargas)}</td>
                      <td className="px-4 py-2 font-mono text-teal-300">{summaryTotals1000.timeLog.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase flex items-center gap-2 px-1 tracking-wider text-left text-indigo-700">
              <div className="w-2 h-2 rounded-full bg-indigo-600" /> Planta 2000 - Guayaquil (Almacén 2006)
            </h3>
            <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full border-collapse text-center font-sans">
                  <thead className="bg-gray-100/80 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 border-r border-gray-100">Fecha</th>
                      <th className="px-4 py-3 border-r border-gray-100">Densidad</th>
                      <th className="px-4 py-3 border-r border-gray-100 bg-blue-50/50 text-blue-800">Apertura</th>
                      <th className="px-4 py-3 border-r border-gray-100">Unidades</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-purple-700">Nro. Subbloque</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-purple-800 font-bold">Nro. Cargas Subbloque</th>
                      <th className="px-4 py-3 text-center text-teal-700 bg-teal-50/20">Tiempo Operativo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px]">
                    {summaryData2000.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-2 font-medium text-gray-400 border-r border-gray-50">{row.fecha}</td>
                        <td className="px-4 py-2 font-bold text-gray-700 border-r border-gray-50">{row.dens}</td>
                        <td className="px-4 py-2 font-bold text-blue-700 border-r border-gray-50 bg-blue-50/5">{row.apertura}</td>
                        <td className="px-4 py-2 font-mono border-r border-gray-50">{row.units.toLocaleString()}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50">{row.subbloques.toFixed(1)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50 bg-purple-50/5">{Math.ceil(row.cargas)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-teal-600 text-center bg-teal-50/5">{row.timeLog.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-800 text-white font-bold text-[11px]">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right uppercase">Total Planta 2000:</td>
                      <td className="px-4 py-2 font-mono">{summaryTotals2000.units.toLocaleString()}</td>
                      <td className="px-4 py-2 font-mono">{summaryTotals2000.subbloques.toFixed(1)}</td>
                      <td className="px-4 py-2 font-mono">{Math.ceil(summaryTotals2000.cargas)}</td>
                      <td className="px-4 py-2 font-mono text-teal-300">{summaryTotals2000.timeLog.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </div>
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
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Parámetro Técnico</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Valor</th>
                  <th className="px-6 py-5 text-left">Descripción Operativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px]">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-amber-50/20">
                    <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-200 uppercase">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-dashed border-gray-200">
                      <Badge variant="outline" className="font-mono text-amber-700 border-amber-200 bg-amber-50/50">{r.valor_restriccion}</Badge>
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
            { t: 'Planta 1000 - Quito', d: provC1000, id: '1000' }, 
            { t: 'Planta 2000 - Guayaquil', d: provC2000, id: '2000' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1", center.id === '1000' ? 'text-green-700' : 'text-indigo-700')}>
                <div className={cn("w-2 h-2 rounded-full", center.id === '1000' ? 'bg-green-600' : 'bg-indigo-600')} /> {center.t} ({center.d.length} órdenes)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full border-collapse text-center">
                    <thead className="bg-gray-100/80 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                        <th className="px-2 py-4 border-r border-gray-100">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-100 bg-blue-50/20">APERT.</th>
                        <th className="px-2 py-4 border-r border-gray-100">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-100">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-100">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100">Cant.</th>
                        <th className="px-3 py-4 border-r border-gray-100">Máquina</th>
                        <th className="px-3 py-4">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                        const hasCategory = String(o.CATEGORIA || '').trim() !== '' && String(o.CATEGORIA || '').trim() !== 'N/A';
                        
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors text-center text-[10px]">
                            <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                            <td className="px-3 py-2 font-mono font-bold text-primary border-r border-gray-100 tracking-tighter">{info.code}</td>
                            <td className="px-3 py-2 text-left border-r border-gray-100 truncate max-w-[180px] text-gray-500 uppercase">{info.desc}</td>
                            <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.dens : '—'}</td>
                            <td className="px-2 py-2 font-mono font-bold text-blue-700 border-r border-gray-100 bg-blue-50/10">{hasCategory ? info.apertura : '—'}</td>
                            <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.ancho : '—'}</td>
                            <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.largo : '—'}</td>
                            <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.esp : '—'}</td>
                            <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-100 font-mono">{qty}</td>
                            <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-100 uppercase">{o.MAQUINA || o.Maquina || o.RECURSO || '—'}</td>
                            <td className="px-3 py-2 font-medium text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
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

        <TabsContent value="tiempos" className="animate-in fade-in duration-300">
          <div className="grid grid-cols-1 gap-10">
            {[ { t: 'Quito 1000', d: summaryTotals1000 }, { t: 'Guayaquil 2000', d: summaryTotals2000 } ].map((center, idx) => (
              <div key={idx} className="space-y-4">
                <h3 className="text-sm font-bold uppercase text-gray-400 text-left">Catálogo de Tiempos</h3>
                <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
                  <div className="p-8 text-center text-gray-400 italic">
                    Utilice la pestaña de Provisionales para ver el detalle por material.
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};