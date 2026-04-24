'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wind, Users, Lock, Package, Loader2, Clock, LayoutDashboard, Truck, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, addMonths, subMonths, isToday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// Constantes de ingeniería de tiempos (en segundos)
const SECONDS_LOAD_BLOCK = 300;      // 5 min por subir un bloque físico completo
const SECONDS_REPETITION = 45;       // 45 seg por movimiento de descarga manual
const SECONDS_CART_SWAP = 60;        // 1 min por cambio de coche (2 bloques por coche)

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  
  // Estado para el calendario
  const [viewDate, setViewDate] = useState(new Date());

  const scrollProv1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollProv2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollResumen1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollResumen2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

  useEffect(() => { setMounted(true); }, []);

  const fetchGruposEspumas = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo && g.nombre_grupo.toLowerCase().includes('espuma')
      );
      setGrupos(filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando grupos:', error);
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
      console.error('Error cargando restricciones:', error);
      return [];
    }
  };

  const loadData = async (filteredGroups: Grupo[]) => {
    try {
      const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      const provData = resProv.data?.data || resProv.data || [];
      setOrders(Array.isArray(provData) ? provData : []);

      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
        const actualData = res.data?.data || res.data || [];
        if (Array.isArray(actualData)) allTiempos.push(...actualData);
      }
      setTiemposEnsamblado(allTiempos);
    } catch (error) {
      console.error('Error cargando datos operativos:', error);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const initData = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGruposEspumas();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await fetchRestricciones(groupsIds);
      await loadData(filteredGroups);
      setIsLoading(false);
    };
    initData();
  }, [mounted]);

  // Extraer fechas únicas que tienen órdenes
  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
        try {
          // Normalizar a YYYY-MM-DD para comparación
          const normalized = d.includes('T') ? d.split('T')[0] : d;
          dates.add(normalized);
        } catch(e) {}
      }
    });
    return dates;
  }, [ordenes]);

  const filterData = (data: any[], centro: string) => {
    if (!data || data.length === 0) return [];
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    if (relevantGroups.length === 0) return [];
    const groupIds = relevantGroups.map(g => g.codigo_grupo);
    const groupRest = restricciones.filter(r => groupIds.includes(r.codigo_grupo));
    const respCodes = groupRest.filter(r => r.nombre_restriccion === 'RESPCTRLPROD').flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim())).filter(v => v !== '');
    const almCodes = groupRest.filter(r => r.nombre_restriccion === 'ALMACEN').flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim())).filter(v => v !== '');

    return data.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = respCodes.length === 0 || respCodes.some(code => itemResp === code || itemResp.includes(code));
      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      const matchAlm = almCodes.length === 0 || itemAlmValue === '' || almCodes.includes(itemAlmValue);
      
      const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      const matchDate = selectedDate === 'all' || itemDate === selectedDate;
      
      return matchResp && matchAlm && matchDate;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restricciones, selectedDate]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restricciones, selectedDate]);
  const tiemposC1000 = useMemo(() => filterData(tiemposEnsamblado, '1000'), [tiemposEnsamblado, grupos, restricciones]);
  const tiemposC2000 = useMemo(() => filterData(tiemposEnsamblado, '2000'), [tiemposEnsamblado, grupos, restricciones]);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    const dimensions = { dens: '—', ancho: '—', largo: '—', esp: '—' };
    if (desc) {
      const densMatch = desc.match(/D-?(\d+)/i);
      if (densMatch) dimensions.dens = densMatch[1];
      const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
      if (dimMatch) {
        dimensions.ancho = dimMatch[1];
        dimensions.largo = dimMatch[2];
        if (dimMatch[3]) dimensions.esp = dimMatch[3];
      }
    }
    return { code, desc, ...dimensions };
  };

  const calculateGroupTotals = (data: any[]) => {
    const map = new Map<string, number>();
    data.forEach(item => {
      const cat = String(item.CATEGORIA || item.Categoria || '').trim();
      if (!cat || cat === 'N/A') return;
      const info = extractMaterialInfo(item);
      const dateRaw = String(item.FECHAINICIO || item.FECHA || 'N/A').trim();
      const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      const key = `${cat}-${date}-${info.ancho}-${info.largo}-${info.esp}`;
      const qty = Number(item.CANTPROGRAMADA || item.CANTIDAD || 0);
      const esp = parseFloat(info.esp) || 0;
      map.set(key, (map.get(key) || 0) + (qty * esp));
    });
    return map;
  };

  const groupTotals1000 = useMemo(() => calculateGroupTotals(provC1000), [provC1000]);
  const groupTotals2000 = useMemo(() => calculateGroupTotals(provC2000), [provC2000]);

  const calculateLogisticoTime = (qty: number, esp: number, nroSubbloques: number) => {
    if (qty <= 0) return 0;
    const blocksCount = Math.ceil(nroSubbloques / 7);
    const timeCarga = blocksCount * SECONDS_LOAD_BLOCK;
    const sheetsPerRep = esp > 10 ? 4 : 3;
    const repetitions = Math.ceil(qty / sheetsPerRep);
    const timeDescarga = repetitions * SECONDS_REPETITION;
    const cartsNeeded = Math.ceil(blocksCount / 2);
    const timeCarts = cartsNeeded * SECONDS_CART_SWAP;
    return (timeCarga + timeDescarga + timeCarts) / 3600;
  };

  const calculateSummary = (data: any[]) => {
    const groupsMap = new Map<string, { fecha: string; categoria: string; ancho: string; largo: string; espesor: string; items: any[] }>();
    
    data.forEach(o => {
      const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
      const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      const categoria = String(o.CATEGORIA || o.Categoria || '').trim();
      if (!categoria || categoria === 'N/A') return;
      const info = extractMaterialInfo(o);
      const key = `${fecha}|${categoria}|${info.ancho}|${info.largo}|${info.esp}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { fecha, categoria, ancho: info.ancho, largo: info.largo, espesor: info.esp, items: [] });
      }
      groupsMap.get(key)!.items.push(o);
    });

    return Array.from(groupsMap.values()).map(group => {
      const infoItems = group.items.map(o => {
        const info = extractMaterialInfo(o);
        const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
        const esp = parseFloat(info.esp) || 0;
        const dens = parseFloat(info.dens) || 0;
        return { qty, esp, dens };
      });

      const totalUnidades = infoItems.reduce((sum, i) => sum + i.qty, 0);
      const totalAltura = infoItems.reduce((sum, i) => sum + (i.qty * i.esp), 0);
      
      const firstDens = infoItems[0]?.dens || 0;
      const alturaUtil = firstDens < 30 ? 103 : 85;
      const nroSubbloques = totalAltura / alturaUtil;
      
      const espVal = parseFloat(group.espesor) || 1;
      const nCycles = Math.floor(alturaUtil / espVal) + 4;
      
      const tiempoLogistico = calculateLogisticoTime(totalUnidades, espVal, nroSubbloques);

      return {
        fecha: group.fecha,
        categoria: group.categoria,
        ancho: group.ancho,
        largo: group.largo,
        espesor: group.espesor,
        totalUnidades,
        totalAltura,
        alturaUtil,
        nroSubbloques,
        cargasB7: nroSubbloques / 7,
        nCycles,
        tiempoLogistico
      };
    }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.categoria.localeCompare(b.categoria));
  };

  const summaryData1000 = useMemo(() => calculateSummary(provC1000), [provC1000]);
  const summaryData2000 = useMemo(() => calculateSummary(provC2000), [provC2000]);

  const setupScrollSync = (group: any) => {
    if (!group.top.current || !group.bottom.current) return;
    const syncB = () => { if (group.bottom.current) group.bottom.current.scrollLeft = group.top.current.scrollLeft; };
    const syncT = () => { if (group.top.current) group.top.current.scrollLeft = group.bottom.current.scrollLeft; };
    group.top.current.addEventListener('scroll', syncB);
    group.bottom.current.addEventListener('scroll', syncT);
    return () => { group.top.current?.removeEventListener('scroll', syncB); group.bottom.current?.removeEventListener('scroll', syncT); };
  };

  useEffect(() => {
    if (!mounted) return;
    const items = [scrollProv1000, scrollProv2000, scrollTiempos1000, scrollTiempos2000, scrollResumen1000, scrollResumen2000];
    const cleaners = items.map(setupScrollSync);
    const timer = setTimeout(() => { items.forEach(s => { if (s.table.current) s.width[1](s.table.current.offsetWidth); }); }, 500);
    return () => { clearTimeout(timer); cleaners.forEach(c => c?.()); };
  }, [activeTab, ordenes, tiemposEnsamblado, mounted]);

  // Funciones auxiliares para el calendario
  const calendarDays = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    
    // Relleno para que el mes empiece el día correcto (Lunes=0 para este grid)
    const firstDayOfWeek = getDay(start); 
    const paddingCount = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    const padding = Array.from({ length: paddingCount }, () => null);
    
    return [...padding, ...days];
  }, [viewDate]);

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Corte Espuma...</p>
    </div>
  );

  const renderTableBody = (data: any[], gTotals: Map<string, number>) => {
    return data.map((o, i) => {
      const cat = String(o.CATEGORIA || o.Categoria || '').trim();
      const hasCategory = cat !== '' && cat !== 'N/A';
      const info = extractMaterialInfo(o);
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);

      let alturaTotal = 0, groupSumHeight = 0, alturaUtil: any = 103, nCycles = 0, nSubItem = 0, cargasB7Item = 0, residuo = 0, destino = '—', cantApoyo = 0, tiempoLogistico = 0;

      if (hasCategory) {
        const e = parseFloat(info.esp) || 0;
        const d = parseFloat(info.dens) || 0;
        alturaTotal = qty * e;
        
        const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        const groupKey = `${cat}-${date}-${info.ancho}-${info.largo}-${info.esp}`;
        groupSumHeight = gTotals.get(groupKey) || 0;
        
        alturaUtil = isNaN(d) ? 103 : (d < 30 ? 103 : 85);
        nCycles = Math.floor(alturaUtil / (e || 1)) + 4;
        nSubItem = alturaTotal / alturaUtil;
        cargasB7Item = nSubItem / 7;
        
        const nSubGroup = groupSumHeight / (alturaUtil || 1);
        residuo = nSubGroup % 7;
        
        tiempoLogistico = calculateLogisticoTime(qty, e, nSubItem);

        if (residuo > 0) {
          if (residuo <= 2) {
            destino = "MÁQ. APOYO";
            cantApoyo = residuo;
          } else {
            destino = "+1 CARGA PPAL.";
          }
        } else if (nSubGroup > 0) {
          destino = "COMPLETO";
        }
      }
      
      return (
        <tr key={i} className="hover:bg-gray-50/50 transition-colors text-center text-[10px]">
          <td className="px-3 py-3 font-semibold text-gray-900 border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
          <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-[9px] text-gray-500">{o.FECHAINICIO || o.FECHA || '—'}</td>
          <td className="px-3 py-3 font-mono font-semibold text-primary border-r border-dashed border-gray-100 tracking-tighter">{info.code}</td>
          <td className="px-3 py-3 text-left border-r border-dashed border-gray-100 truncate max-w-[200px] text-gray-500 uppercase">{info.desc}</td>
          <td className="px-3 py-3 font-medium text-gray-400 border-r border-dashed border-gray-100 uppercase">{hasCategory ? cat : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 bg-blue-50/5">{hasCategory ? info.dens : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 bg-blue-50/5">{hasCategory ? info.ancho : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 bg-blue-50/5">{hasCategory ? info.largo : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 bg-blue-50/5">{hasCategory ? info.esp : '—'}</td>
          <td className="px-3 py-3 font-semibold text-gray-900 border-r border-dashed border-gray-100 font-mono">{qty}</td>
          <td className="px-2 py-3 font-mono font-bold text-indigo-900 border-r border-dashed border-gray-100 bg-indigo-50/10">{hasCategory ? alturaTotal.toFixed(2) : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-purple-900 border-r border-dashed border-gray-100 bg-purple-50/5">{hasCategory ? groupSumHeight.toFixed(2) : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-teal-900 border-r border-dashed border-gray-100 bg-teal-50/10">{hasCategory ? alturaUtil : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold border-r border-dashed border-gray-100 bg-teal-50/10 text-teal-700">{hasCategory ? nCycles : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-orange-700 border-r border-dashed border-gray-100 bg-orange-50/5">{hasCategory ? nSubItem.toFixed(2) : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-orange-900 border-r border-dashed border-gray-100 bg-orange-50/5">{hasCategory ? cargasB7Item.toFixed(1) : '—'}</td>
          <td className={cn("px-2 py-3 font-bold border-r border-dashed border-gray-100 text-[8px]", hasCategory && destino.includes('APOYO') ? 'text-blue-600' : 'text-gray-500')}>{hasCategory ? destino : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100">{hasCategory && cantApoyo > 0 ? cantApoyo.toFixed(2) : '—'}</td>
          <td className="px-3 py-3 font-mono font-bold border-r border-dashed border-gray-100 text-teal-600 bg-teal-50/5">
            {hasCategory && tiempoLogistico > 0 ? tiempoLogistico.toFixed(2) : '—'}
          </td>
          <td className="px-3 py-3 font-medium text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
        </tr>
      );
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-6 bg-gray-50/50 min-h-screen">
      <div className="flex items-center space-x-3 pb-2 border-b border-gray-100">
        <Wind className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tighter">Planificación Táctica Corte Espuma</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-11 bg-muted/30 p-1 rounded-lg">
          <TabsTrigger value="resumen" className="gap-2 text-[10px] font-semibold uppercase"><LayoutDashboard className="w-3 h-3" /> Resumen</TabsTrigger>
          <TabsTrigger value="grupos" className="gap-2 text-[10px] font-semibold uppercase"><Users className="w-3 h-3" /> Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="gap-2 text-[10px] font-semibold uppercase"><Lock className="w-3 h-3" /> Filtros</TabsTrigger>
          <TabsTrigger value="ordenes" className="gap-2 text-[10px] font-semibold uppercase"><Package className="w-3 h-3" /> Provisionales</TabsTrigger>
          <TabsTrigger value="tiempos" className="gap-2 text-[10px] font-semibold uppercase"><Clock className="w-3 h-3" /> Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-8 mt-4">
          
          {/* Selector de Fecha Estilo Calendario */}
          <div className="flex justify-center">
            <Card className="w-full max-w-sm rounded-3xl border-none shadow-xl bg-white p-6 transition-all duration-500 hover:shadow-2xl">
              <div className="flex flex-col space-y-6">
                
                {/* Header Selector */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Horizonte de Planificación</span>
                    <h3 className="text-lg font-black text-gray-800 capitalize">
                      {format(viewDate, 'MMMM yyyy', { locale: es })}
                    </h3>
                  </div>
                  <div className="flex gap-1 bg-gray-50 rounded-xl p-1">
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="rounded-lg hover:bg-white hover:shadow-sm h-8 w-8">
                      <ChevronLeft className="w-4 h-4 text-gray-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="rounded-lg hover:bg-white hover:shadow-sm h-8 w-8">
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    </Button>
                  </div>
                </div>

                {/* Grid de Días */}
                <div className="grid grid-cols-7 gap-y-2 text-center">
                  {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(day => (
                    <div key={day} className="text-[10px] font-bold text-gray-400 uppercase py-2">
                      {day}
                    </div>
                  ))}
                  
                  {calendarDays.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="p-2" />;
                    
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const isSelected = selectedDate === dateStr;
                    const hasData = datesWithOrders.has(dateStr);
                    const isTodayDate = isToday(day);

                    return (
                      <button
                        key={dateStr}
                        onClick={() => setSelectedDate(isSelected ? 'all' : dateStr)}
                        className={cn(
                          "relative p-2 h-10 w-10 mx-auto rounded-full flex flex-col items-center justify-center transition-all duration-200 group",
                          isSelected ? "bg-primary text-white shadow-lg shadow-primary/30" : "hover:bg-gray-50",
                          isTodayDate && !isSelected ? "ring-1 ring-primary/30 ring-inset" : ""
                        )}
                      >
                        <span className={cn(
                          "text-xs font-bold",
                          isSelected ? "text-white" : isTodayDate ? "text-primary" : "text-gray-700",
                          !hasData && !isSelected ? "text-gray-300 font-normal" : ""
                        )}>
                          {format(day, 'd')}
                        </span>
                        
                        {/* Indicador de Datos (Punto) */}
                        {hasData && (
                          <div className={cn(
                            "absolute bottom-1.5 w-1 h-1 rounded-full",
                            isSelected ? "bg-white" : "bg-primary/40 group-hover:bg-primary"
                          )} />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                  <Badge variant="outline" className="rounded-full text-[9px] font-bold uppercase tracking-tight bg-gray-50 text-gray-400 border-gray-100">
                    {selectedDate === 'all' ? 'Vista Consolidada' : `Filtrado: ${selectedDate}`}
                  </Badge>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedDate('all')}
                    className="text-[9px] font-black uppercase text-primary hover:bg-primary/5 rounded-xl h-7"
                  >
                    Ver Todo el Plan
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {[ 
            { t: 'Resumen Logístico Planta 1000', d: summaryData1000, s: scrollResumen1000, c: 'text-green-700', b: 'bg-green-600' }, 
            { t: 'Resumen Logístico Planta 2000', d: summaryData2000, s: scrollResumen2000, c: 'text-indigo-700', b: 'bg-indigo-600' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className={cn("text-xs font-bold uppercase flex items-center gap-2 px-1", center.c)}>
                <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} /> {center.t}
              </h3>
              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[400px]">
                  <table ref={center.s.table} className="w-full border-collapse text-center">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-[8px] font-black uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200">Fecha</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200">Categoría</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 bg-blue-50/20">Ancho</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 bg-blue-50/20">Largo</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 bg-blue-50/20">Espesor</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200">Unidades</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-indigo-700 bg-indigo-50/10">Altura Total</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-teal-700 bg-teal-50/10">Altura Útil</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-teal-900 bg-teal-50/5">Nro Ciclos</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-purple-700 bg-purple-50/10">Nro Subbloques</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-orange-700 bg-orange-50/20 font-black">Cargas (B7)</th>
                        <th className="px-4 py-4 text-center text-teal-700 bg-teal-50/30 font-black"><Truck className="w-3 h-3 inline mr-1"/> Carga/Desc. (h)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[10px]">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={12} className="py-8 text-center text-gray-400 italic">Sin bloques programados para esta selección</td></tr>
                      ) : (
                        center.d.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors text-center">
                            <td className="px-3 py-3 font-mono text-gray-500 border-r border-dashed border-gray-100">{row.fecha}</td>
                            <td className="px-3 py-3 font-bold text-gray-700 border-r border-dashed border-gray-100 uppercase">{row.categoria}</td>
                            <td className="px-2 py-3 font-mono font-bold text-blue-600 border-r border-dashed border-gray-100 bg-blue-50/5">{row.ancho}</td>
                            <td className="px-2 py-3 font-mono font-bold text-blue-600 border-r border-dashed border-gray-100 bg-blue-50/5">{row.largo}</td>
                            <td className="px-2 py-3 font-mono font-bold text-blue-600 border-r border-dashed border-gray-100 bg-blue-50/5">{row.espesor}</td>
                            <td className="px-3 py-3 font-mono font-semibold border-r border-dashed border-gray-100">{row.totalUnidades.toLocaleString()}</td>
                            <td className="px-3 py-3 font-mono font-bold text-indigo-700 border-r border-dashed border-gray-100 bg-indigo-50/5">{row.totalAltura.toFixed(2)}</td>
                            <td className="px-3 py-3 font-mono font-bold text-teal-700 border-r border-dashed border-gray-100 bg-teal-50/5">{row.alturaUtil}</td>
                            <td className="px-3 py-3 font-mono font-bold text-teal-900 border-r border-dashed border-gray-100 bg-teal-50/5">{row.nCycles}</td>
                            <td className="px-3 py-3 font-mono font-bold text-purple-700 border-r border-dashed border-gray-100 bg-purple-50/5">{row.nroSubbloques.toFixed(2)}</td>
                            <td className="px-3 py-3 font-mono font-black text-orange-700 border-r border-dashed border-gray-100 bg-orange-50/10">{row.cargasB7.toFixed(1)}</td>
                            <td className="px-4 py-3 font-mono font-bold text-teal-600 text-center bg-teal-50/10">{row.tiempoLogistico.toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="ordenes" className="mt-4 space-y-8">
          {[ 
            { t: 'Planta 1000 - Quito (Provisionales)', d: provC1000, s: scrollProv1000, b: 'bg-green-600', c: 'text-green-700', gTotals: groupTotals1000 }, 
            { t: 'Planta 2000 - Guayaquil (Provisionales)', d: provC2000, s: scrollProv2000, b: 'bg-indigo-600', c: 'text-indigo-700', gTotals: groupTotals2000 } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className={cn("text-xs font-bold uppercase flex items-center gap-2", center.c)}>
                <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} /> {center.t} ({center.d.length} órdenes)
              </h3>
              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b border-gray-100"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[450px]">
                  <table ref={center.s.table} className="w-full border-collapse text-center">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-[8px] font-black uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Orden</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Fecha Inicio</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Material</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200">Categoría</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-blue-800 bg-blue-50/20">DENS.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-blue-800 bg-blue-50/20">ANCHO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-blue-800 bg-blue-50/20">LARGO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-blue-800 bg-blue-50/20">ESP.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Cant.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 text-indigo-900 bg-indigo-50/30">ALTURA TOT.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 text-purple-900 bg-purple-50/20">SUMA ALT. GRP</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 text-teal-900 bg-teal-50/20">ALTURA UTIL</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-teal-50/10 text-teal-700">NRO CICLOS</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10">NRO SUBBL.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10 font-black">CARGAS (B7)</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10">RESIDUO / DESTINO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10">CANT. APOYO</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-100 text-teal-700 bg-teal-50/30 text-center">Carga/Desc. (h)</th>
                        <th className="px-3 py-4 text-center">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {renderTableBody(center.d, center.gTotals)}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="grupos" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-xl transition-all duration-300 border-none rounded-3xl bg-white p-6">
                <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
                <Badge className="w-fit bg-primary mb-2">PLANTA {g.centro}</Badge>
                <h4 className="font-bold text-gray-800 uppercase text-lg leading-tight">{g.nombre_grupo}</h4>
                <p className="text-[10px] font-mono text-gray-400 mt-1 uppercase">Código Interno: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones" className="mt-4">
          <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Parámetro Técnico</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Valor Configurado</th>
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

        <TabsContent value="tiempos" className="mt-4 space-y-8">
          {[ { t: 'Catálogo Técnico - Quito 1000', d: tiemposC1000, s: scrollProv1000, c: 'text-teal-700', b: 'bg-teal-600' }, { t: 'Catálogo Técnico - Guayaquil 2000', d: tiemposC2000, s: scrollProv2000, c: 'text-cyan-700', b: 'bg-cyan-600' } ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <h3 className={cn("text-xs font-bold uppercase flex items-center gap-2", center.c)}>
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} /> {center.t} ({center.d.length} materiales)
                </h3>
              </div>
              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b border-gray-100">
                  <div style={{ width: center.s.width[0], height: '1px' }} />
                </div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[450px]">
                  <table ref={center.s.table} className="w-full border-collapse text-center">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-[8px] font-black uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-center">Material</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-left">Descripción Técnica</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200">Línea Prod.</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-teal-700">Estándar (Min)</th>
                        <th className="px-4 py-4 text-center text-gray-400">Stock / Seguridad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[10px]">
                      {center.d.map((t, i) => {
                        const info = extractMaterialInfo(t);
                        return (
                          <tr key={i} className="hover:bg-teal-50/20 transition-colors">
                            <td className="px-4 py-3 font-mono font-semibold text-teal-700 border-r border-dashed border-gray-100 text-center tracking-tighter">{info.code}</td>
                            <td className="px-4 py-3 text-left border-r border-dashed border-gray-100 text-gray-500 uppercase truncate max-w-[280px]">{info.desc}</td>
                            <td className="px-4 py-3 border-r border-dashed border-gray-200 font-medium text-gray-400 uppercase">{t.Linea || '—'}</td>
                            <td className="px-4 py-3 font-mono font-bold text-teal-600 border-r border-dashed border-gray-100">{(t.Tiempo_Min || t.Tiempo || 0).toFixed(2)}</td>
                            <td className="px-4 py-3 text-center font-medium text-gray-300">{t.StockActual || 0} / {t.StockSeguridad || 0}</td>
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
      </Tabs>
    </div>
  );
};
