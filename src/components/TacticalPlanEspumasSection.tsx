
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wind, Users, Lock, Package, Loader2, Clock, LayoutDashboard, Truck, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, AlertTriangle } from 'lucide-react';
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  // Refs para sincronización de scroll y anchos de tabla
  const scrollProv1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollProv2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollResumen1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollResumen2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

  useEffect(() => { setMounted(true); }, []);

  const fetchGruposRelevantes = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return name.includes('espuma') || name.includes('corte y laminado');
      });
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
      const filteredGroups = await fetchGruposRelevantes();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await fetchRestricciones(groupsIds);
      await loadData(filteredGroups);
      setIsLoading(false);
    };
    initData();
  }, [mounted]);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
        try {
          const normalized = d.includes('T') ? d.split('T')[0] : d;
          dates.add(normalized);
        } catch(e) {}
      }
    });
    return dates;
  }, [ordenes]);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions = { dens: '—', ancho: '—', largo: '—', esp: '—', apertura: 'OTRA' };
    if (desc) {
      const densMatch = desc.match(/D-?(\d+)/i);
      if (densMatch) dimensions.dens = densMatch[1];
      
      const aperturaMatch = desc.match(/194\.5|206|219/);
      if (aperturaMatch) dimensions.apertura = aperturaMatch[0];

      const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
      if (dimMatch) {
        dimensions.ancho = dimMatch[1];
        dimensions.largo = dimMatch[2];
        if (dimMatch[3]) dimensions.esp = dimMatch[3];
      }
    }
    return { code, desc, ...dimensions };
  };

  const filterData = (data: any[], centro: string, applyDateFilter: boolean = true) => {
    if (!data || data.length === 0) return [];
    
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    if (relevantGroups.length === 0) return [];

    return data.filter(o => {
      const info = extractMaterialInfo(o);
      
      // REGLA 1: Excluir Producto Terminado (Códigos que inician con '1')
      if (info.code.startsWith('1')) return false;

      // REGLA 2: Validar Centro
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;

      // REGLA 3: Filtrado ESTRICTO por Almacén y Centro
      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      if (centro === '1000' && itemAlmValue !== '1006') return false;
      if (centro === '2000' && itemAlmValue !== '2006') return false;

      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const itemSectorValue = String(o.SECTORDESC || o.Sector || o.SECTOR || '').trim();

      // REGLA 4: El material debe coincidir simultáneamente con Responsable Y Sector de un grupo
      const matchesAnyGroup = relevantGroups.some(g => {
        const groupRest = restricciones.filter(r => r.codigo_grupo === g.codigo_grupo);
        
        const respCodes = groupRest
          .filter(r => r.nombre_restriccion === 'RESPCTRLPROD' || r.nombre_restriccion === 'Resp. Control' || r.nombre_restriccion === 'RespCtrlProd_Carrusel')
          .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
          .filter(v => v !== '');
        
        const sectorCodes = groupRest
          .filter(r => r.nombre_restriccion === 'SECTOR')
          .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
          .filter(v => v !== '');

        const matchResp = respCodes.length === 0 || respCodes.includes(itemResp);
        const matchSector = sectorCodes.length === 0 || itemSectorValue === '' || sectorCodes.some(code => itemSectorValue.includes(code));

        return matchResp && matchSector;
      });

      if (!matchesAnyGroup) return false;

      if (applyDateFilter) {
        const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
        const matchDate = selectedDate === 'all' || itemDate === selectedDate;
        if (!matchDate) return false;
      }
      
      return true;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restricciones, selectedDate]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restricciones, selectedDate]);
  const tiemposC1000 = useMemo(() => filterData(tiemposEnsamblado, '1000', false), [tiemposEnsamblado, grupos, restricciones]);
  const tiemposC2000 = useMemo(() => filterData(tiemposEnsamblado, '2000', false), [tiemposEnsamblado, grupos, restricciones]);

  const calculateSummary = (data: any[]) => {
    const groupsMap = new Map<string, { fecha: string; dens: string; apertura: string; units: number; subbloques: number; bloques20m: number; timeLog: number }>();
    
    data.forEach(o => {
      const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
      const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      
      const info = extractMaterialInfo(o);
      const key = `${fecha}|${info.dens}|${info.apertura}`;
      
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      const ancho = parseFloat(info.ancho) || 0;
      const esp = parseFloat(info.esp) || 0;
      const dens = parseFloat(info.dens) || 0;
      
      const usefulHeight = isNaN(dens) ? 103 : (dens < 30 ? 103 : 85);
      const itemSubbloques = (qty * esp) / usefulHeight;
      const itemBloques20m = (ancho * itemSubbloques) / 2000;
      
      const physicalBlocksCount = Math.ceil(itemBloques20m);
      const tCarga = physicalBlocksCount * SECONDS_LOAD_BLOCK;
      const sheetsPerRep = esp > 10 ? 4 : 3;
      const tDescarga = Math.ceil(qty / sheetsPerRep) * SECONDS_REPETITION;
      const tCoches = Math.ceil(physicalBlocksCount / 2) * SECONDS_CART_SWAP;
      const itemTimeLog = (tCarga + tDescarga + tCoches) / 3600;

      if (!groupsMap.has(key)) {
        groupsMap.set(key, { fecha, dens: info.dens, apertura: info.apertura, units: 0, subbloques: 0, bloques20m: 0, timeLog: 0 });
      }
      
      const entry = groupsMap.get(key)!;
      entry.units += qty;
      entry.subbloques += itemSubbloques;
      entry.bloques20m += itemBloques20m;
      entry.timeLog += itemTimeLog;
    });

    return Array.from(groupsMap.values()).sort((a, b) => 
      a.fecha.localeCompare(b.fecha) || a.dens.localeCompare(b.dens) || a.apertura.localeCompare(b.apertura)
    );
  };

  const summaryData1000 = useMemo(() => calculateSummary(provC1000), [provC1000]);
  const summaryData2000 = useMemo(() => calculateSummary(provC2000), [provC2000]);

  const summaryTotals1000 = useMemo(() => {
    return summaryData1000.reduce((acc, row) => ({
      units: acc.units + row.units,
      subbloques: acc.subbloques + row.subbloques,
      bloques20m: acc.bloques20m + row.bloques20m,
      timeLog: acc.timeLog + row.timeLog
    }), { units: 0, subbloques: 0, bloques20m: 0, timeLog: 0 });
  }, [summaryData1000]);

  const summaryTotals2000 = useMemo(() => {
    return summaryData2000.reduce((acc, row) => ({
      units: acc.units + row.units,
      subbloques: acc.subbloques + row.subbloques,
      bloques20m: acc.bloques20m + row.bloques20m,
      timeLog: acc.timeLog + row.timeLog
    }), { units: 0, subbloques: 0, bloques20m: 0, timeLog: 0 });
  }, [summaryData2000]);

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

  const calendarDays = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const firstDayOfWeek = getDay(start); 
    const paddingCount = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    const padding = Array.from({ length: paddingCount }, () => null);
    return [...padding, ...days];
  }, [viewDate]);

  const restrictionsByCenter = useMemo(() => {
    const map = new Map<string, Restriccion[]>();
    restricciones.forEach(r => {
      const g = grupos.find(group => group.codigo_grupo === r.codigo_grupo);
      const centerId = g?.centro || 'General';
      if (!map.has(centerId)) map.set(centerId, []);
      map.get(centerId)!.push(r);
    });
    return map;
  }, [restricciones, grupos]);

  if (!mounted) return null;

  const renderTableBody = (data: any[], centroId: string) => {
    return data.map((o, i) => {
      const cat = String(o.CATEGORIA || o.Categoria || '').trim();
      const hasCategory = cat !== '' && cat !== 'N/A';
      const info = extractMaterialInfo(o);
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      let alturaTotal = 0, usefulHeight = 103, nCycles = 0, nSubItem = 0, bloques20mItem = 0, residuo = 0, destino = '—', cantApoyo = 0, tiempoLogistico = 0;
      
      if (hasCategory) {
        const e = parseFloat(info.esp) || 0;
        const d = parseFloat(info.dens) || 0;
        const w = parseFloat(info.ancho) || 0;
        alturaTotal = qty * e;
        usefulHeight = isNaN(d) ? 103 : (d < 30 ? 103 : 85);
        nCycles = Math.floor(usefulHeight / (e || 1)) + 4;
        nSubItem = alturaTotal / usefulHeight;
        bloques20mItem = (w * nSubItem) / 2000;
        
        const physicalBlocksCount = Math.ceil(bloques20mItem);
        const tCarga = physicalBlocksCount * SECONDS_LOAD_BLOCK;
        const sheetsPerRep = e > 10 ? 4 : 3;
        const tDescarga = Math.ceil(qty / sheetsPerRep) * SECONDS_REPETITION;
        const tCoches = Math.ceil(physicalBlocksCount / 2) * SECONDS_CART_SWAP;
        tiempoLogistico = (tCarga + tDescarga + tCoches) / 3600;

        // LÓGICA DE DESTINO DIFERENCIADA POR PLANTA
        if (centroId === '2000') {
          // Planta 2000 maneja carga única
          destino = "CARGA PPAL.";
          cantApoyo = 0;
        } else {
          // Planta 1000 permite máquinas de apoyo para residuos pequeños
          residuo = nSubItem % 7;
          if (residuo > 0) {
            if (residuo <= 2) {
              destino = "MÁQ. APOYO";
              cantApoyo = residuo;
            } else {
              destino = "+1 CARGA PPAL.";
            }
          } else if (nSubItem > 0) {
            destino = "COMPLETO";
          }
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
          <td className="px-2 py-3 font-mono font-bold text-teal-900 border-r border-dashed border-gray-100 bg-teal-50/10">{hasCategory ? usefulHeight : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold border-r border-dashed border-gray-100 bg-teal-50/10 text-teal-700">{hasCategory ? nCycles : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-orange-700 border-r border-dashed border-gray-100 bg-orange-50/5">{hasCategory ? nSubItem.toFixed(2) : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-orange-900 border-r border-dashed border-gray-100 bg-orange-50/5">{hasCategory ? bloques20mItem.toFixed(1) : '—'}</td>
          <td className={cn("px-2 py-3 font-bold border-r border-dashed border-gray-100 text-[8px]", hasCategory && destino.includes('APOYO') ? 'text-blue-600' : 'text-gray-500')}>{hasCategory ? destino : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100">
            {hasCategory && centroId !== '2000' && cantApoyo > 0 ? cantApoyo.toFixed(2) : '—'}
          </td>
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

        <TabsContent value="resumen" className="space-y-6 mt-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl">
                <CalendarIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Fecha de Planificación</p>
                <h3 className="text-sm font-black text-gray-800 uppercase">
                  {selectedDate === 'all' ? 'Vista Consolidada' : format(parseISO(selectedDate), 'd MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-10 px-4 rounded-xl border-2 hover:bg-gray-50 gap-2 font-bold text-xs uppercase shadow-sm">
                    <Filter className="w-3.5 h-3.5" />
                    Cambiar Fecha
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-3xl overflow-hidden" align="end">
                  <Card className="w-full max-w-sm rounded-3xl border-none bg-white p-6">
                    <div className="flex flex-col space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-gray-800 capitalize">
                          {format(viewDate, 'MMMM yyyy', { locale: es })}
                        </h3>
                        <div className="flex gap-1 bg-gray-50 rounded-xl p-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="rounded-lg h-7 w-7">
                            <ChevronLeft className="w-4 h-4 text-gray-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="rounded-lg h-7 w-7">
                            <ChevronRight className="w-4 h-4 text-gray-600" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-7 gap-y-1 text-center">
                        {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(day => (
                          <div key={day} className="text-[9px] font-bold text-gray-400 uppercase py-2">
                            {day}
                          </div>
                        ))}
                        
                        {calendarDays.map((day, idx) => {
                          if (!day) return <div key={`empty-${idx}`} className="p-2" />;
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const isSelected = selectedDate === dateStr;
                          const hasData = datesWithOrders.has(dateStr);
                          return (
                            <button
                              key={dateStr}
                              onClick={() => setSelectedDate(isSelected ? 'all' : dateStr)}
                              className={cn(
                                "relative p-2 h-9 w-9 mx-auto rounded-full flex flex-col items-center justify-center transition-all duration-200 group",
                                isSelected ? "bg-primary text-white shadow-lg shadow-primary/30" : "hover:bg-gray-50"
                              )}
                            >
                              <span className={cn(
                                "text-[11px] font-bold",
                                isSelected ? "text-white" : isToday(day) ? "text-primary" : "text-gray-700",
                                !hasData && !isSelected ? "text-gray-300 font-normal" : ""
                              )}>
                                {format(day, 'd')}
                              </span>
                              {hasData && <div className={cn("absolute bottom-1 w-1 h-1 rounded-full", isSelected ? "bg-white" : "bg-primary/40 group-hover:bg-primary")} />}
                            </button>
                          );
                        })}
                      </div>
                      <div className="pt-4 border-t border-gray-100">
                        <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-primary hover:bg-primary/5 rounded-xl h-9" onClick={() => setSelectedDate('all')}>Ver Todo el Plan</Button>
                      </div>
                    </div>
                  </Card>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {[ 
            { t: 'Resumen Ejecutivo Planta 1000', d: summaryData1000, s: scrollResumen1000, c: 'text-green-700', b: 'bg-green-600', totals: summaryTotals1000 }, 
            { t: 'Resumen Ejecutivo Planta 2000', d: summaryData2000, s: scrollResumen2000, c: 'text-indigo-700', b: 'bg-indigo-600', totals: summaryTotals2000 } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-6">
              <h3 className={cn("text-xs font-black uppercase flex items-center gap-2 px-1", center.c)}>
                <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} /> {center.t}
              </h3>
              
              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[500px]">
                  <table ref={center.s.table} className="w-full border-collapse text-center">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-[8px] font-black uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200">Fecha</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200">Densidad</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 bg-blue-50/20 text-blue-800">Apertura</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200">Unidades</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-purple-700 bg-purple-50/10">Subbloques</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-orange-700 bg-orange-50/20 font-black">Bloques (20m)</th>
                        <th className="px-4 py-4 text-center text-teal-700 bg-teal-50/30 font-black"><Truck className="w-3 h-3 inline mr-1"/> Carga/Desc. (h)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[10px]">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={7} className="py-8 text-center text-gray-400 italic">Sin datos programados</td></tr>
                      ) : (
                        center.d.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors text-center">
                            <td className="px-3 py-3 font-mono text-gray-500 border-r border-dashed border-gray-100">{row.fecha}</td>
                            <td className="px-3 py-3 font-bold text-gray-700 border-r border-dashed border-gray-100 uppercase">{row.dens}</td>
                            <td className="px-3 py-3 font-black text-blue-700 border-r border-dashed border-gray-100 bg-blue-50/5">{row.apertura}</td>
                            <td className="px-3 py-3 font-mono font-semibold border-r border-dashed border-gray-100">{row.units.toLocaleString()}</td>
                            <td className="px-3 py-3 font-mono font-bold text-purple-700 border-r border-dashed border-gray-100 bg-purple-50/5">{row.subbloques.toFixed(2)}</td>
                            <td className="px-3 py-3 font-mono font-black text-orange-700 border-r border-dashed border-gray-100 bg-orange-50/10">{row.bloques20m.toFixed(1)}</td>
                            <td className="px-4 py-3 font-mono font-bold text-teal-600 text-center bg-teal-50/10">{row.timeLog.toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-gray-800 text-white text-[10px] font-bold sticky bottom-0">
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-right">TOTALES FILTRADOS</td>
                        <td className="px-3 py-3 font-mono">{center.totals.units.toLocaleString()}</td>
                        <td className="px-3 py-3 font-mono">{center.totals.subbloques.toFixed(2)}</td>
                        <td className="px-3 py-3 font-mono">{center.totals.bloques20m.toFixed(1)}</td>
                        <td className="px-4 py-3 font-mono">{center.totals.timeLog.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="ordenes" className="mt-4 space-y-8">
          {[ 
            { t: 'Planta 1000 - Quito (Almacén 1006)', d: provC1000, s: scrollProv1000, b: 'bg-green-600', c: 'text-green-700', id: '1000' }, 
            { t: 'Planta 2000 - Guayaquil (Almacén 2006)', d: provC2000, s: scrollProv2000, b: 'bg-indigo-600', c: 'text-indigo-700', id: '2000' } 
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
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 text-teal-900 bg-teal-50/20">ALTURA UTIL</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-teal-50/10 text-teal-700">NRO CICLOS</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10">NRO SUBBL.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10 font-black">BLOQUES 20M</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10">RESIDUO / DESTINO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100">CANT. APOYO</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-100 text-teal-700 bg-teal-50/30 text-center">Carga/Desc. (h)</th>
                        <th className="px-3 py-4 text-center">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {renderTableBody(center.d, center.id)}
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

        <TabsContent value="restricciones" className="mt-4 space-y-6">
          {[ 
            { id: '1000', label: 'Quito', color: 'text-green-700', border: 'bg-green-600' }, 
            { id: '2000', label: 'Guayaquil', color: 'text-indigo-700', border: 'bg-indigo-600' } 
          ].map(center => {
            const list = restrictionsByCenter.get(center.id) || [];
            return (
              <div key={center.id} className="space-y-3">
                <h3 className={cn("text-xs font-bold uppercase flex items-center gap-2 px-1", center.color)}>
                  <div className={cn("w-2 h-2 rounded-full", center.border)} /> Planta {center.label}
                </h3>
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
                      {list.length === 0 ? (
                        <tr><td colSpan={3} className="py-8 text-center text-gray-400 italic">No hay restricciones configuradas para esta planta</td></tr>
                      ) : (
                        list.map(r => (
                          <tr key={r.codigo_restriccion} className="hover:bg-amber-50/20">
                            <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-200 uppercase">{r.nombre_restriccion}</td>
                            <td className="px-6 py-4 border-r border-dashed border-gray-200">
                              <Badge variant="outline" className="font-mono text-amber-700 border-amber-200 bg-amber-50/50">{r.valor_restriccion}</Badge>
                            </td>
                            <td className="px-6 py-4 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Card>
              </div>
            );
          })}
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
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-teal-700">Estándar (Seg)</th>
                        <th className="px-4 py-4 text-center text-gray-400">Stock / Seguridad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[10px]">
                      {center.d.map((t, i) => {
                        const info = extractMaterialInfo(t);
                        const stockCritical = Number(t.StockActual || 0) < Number(t.StockSeguridad || 0);
                        return (
                          <tr key={i} className="hover:bg-teal-50/20 transition-colors">
                            <td className="px-4 py-3 font-mono font-semibold text-teal-700 border-r border-dashed border-gray-100 text-center tracking-tighter">{info.code}</td>
                            <td className="px-4 py-3 text-left border-r border-dashed border-gray-100 text-gray-500 uppercase truncate max-w-[280px]">{info.desc}</td>
                            <td className="px-4 py-3 border-r border-dashed border-gray-200 font-medium text-gray-400 uppercase">{t.Linea || '—'}</td>
                            <td className="px-4 py-3 font-mono font-bold text-teal-600 border-r border-dashed border-gray-100">{(t.Tiempo_Min || t.Tiempo || 0).toFixed(2)}s</td>
                            <td className={cn("px-4 py-3 text-center font-medium", stockCritical ? "text-red-500 bg-red-50/50" : "text-gray-300")}>
                              <div className="flex items-center justify-center gap-1">
                                {stockCritical && <AlertTriangle className="w-3 h-3" />}
                                {t.StockActual || 0} / {t.StockSeguridad || 0}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
          <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
             <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest flex items-center gap-2">
               <Clock className="w-3 h-3" /> Nota de Ingeniería: Los tiempos mostrados son segundos por unidad ( lámina ) y están sincronizados con los filtros de Responsable y Sector de cada planta. Solo se muestran materiales semielaborados (códigos 3x/4x) pertenecientes a los almacenes 1006 (Quito) y 2006 (Guayaquil).
             </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
