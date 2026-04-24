'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, Clock, LayoutDashboard, Calendar as CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const TacticalPlanVentaExternaSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanVentaExterna');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');

  const scrollProv = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollFert = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollResumen1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollResumen2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

  useEffect(() => { setMounted(true); }, []);

  const fetchGrupos = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo && (g.nombre_grupo.toLowerCase().includes('venta externa') || g.nombre_grupo.toLowerCase().includes('ventaexterna'))
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
      const pProv = serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] }));
      const pFert = serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] }));
      
      const [resProv, resFert] = await Promise.all([pProv, pFert]);
      
      setOrders(resProv.data || []);
      setOrdersFert(resFert.data || []);

      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        try {
          const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
          const actualData = res.data?.data || res.data || [];
          if (Array.isArray(actualData)) allTiempos.push(...actualData);
        } catch (e) {
          console.warn(`Error cargando tiempos para grupo ${g.codigo_grupo}`);
        }
      }
      setTiemposEnsamblado(allTiempos);
    } catch (error) {
      console.error('Error en loadData:', error);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const init = async () => {
      setIsLoading(true);
      const groups = await fetchGrupos();
      const ids = groups.map(g => g.codigo_grupo);
      await fetchRestricciones(ids);
      await loadData(groups);
      setIsLoading(false);
    };
    init();
  }, [mounted]);

  const fertDates = useMemo(() => {
    const dates = new Set<string>();
    ordenesFert.forEach(o => { 
      const d = String(o.FECHA || '').trim();
      if (d && d !== 'null' && d !== 'undefined') dates.add(d); 
    });
    return Array.from(dates).sort().reverse();
  }, [ordenesFert]);

  const filterData = (data: any[], centro: string, applyDateFilter: boolean = true) => {
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    if (relevantGroups.length === 0) return [];
    
    const groupIds = relevantGroups.map(g => g.codigo_grupo);
    const groupRest = restricciones.filter(r => groupIds.includes(r.codigo_grupo));
    
    const respCodes = groupRest
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almCodes = groupRest
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    const sectorCodes = groupRest
      .filter(r => r.nombre_restriccion === 'SECTOR')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return data.filter(o => {
      const itemCentro = String(o.CENTRO || o.Centro || o.centro || '').trim();
      if (itemCentro !== centro) return false;
      
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = respCodes.length === 0 || respCodes.some(code => itemResp === code || itemResp.includes(code));
      
      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      const hasAlmField = o.hasOwnProperty('ALMACEN') || o.hasOwnProperty('Almacen') || o.hasOwnProperty('almacen');
      const matchAlm = !hasAlmField || almCodes.length === 0 || itemAlmValue === '' || almCodes.includes(itemAlmValue);
      
      const itemSectorValue = String(o.SECTORDESC || o.Sector || o.SECTOR || '').trim();
      const hasSectorField = o.hasOwnProperty('SECTORDESC') || o.hasOwnProperty('Sector') || o.hasOwnProperty('SECTOR');
      const matchSector = !hasSectorField || sectorCodes.length === 0 || itemSectorValue === '' || sectorCodes.some(code => itemSectorValue.includes(code));

      if (applyDateFilter) {
        const itemDate = String(o.FECHA || o.FECHAINICIO || '').trim();
        const matchDate = selectedDate === 'all' || itemDate === selectedDate;
        return matchResp && matchAlm && matchSector && matchDate;
      }

      return matchResp && matchAlm && matchSector;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restricciones, selectedDate]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restricciones, selectedDate]);
  const fertC1000 = useMemo(() => filterData(ordenesFert, '1000'), [ordenesFert, grupos, restricciones, selectedDate]);
  const fertC2000 = useMemo(() => filterData(ordenesFert, '2000'), [ordenesFert, grupos, restricciones, selectedDate]);
  const tiemposC1000 = useMemo(() => filterData(tiemposEnsamblado, '1000', false), [tiemposEnsamblado, grupos, restricciones]);
  const tiemposC2000 = useMemo(() => filterData(tiemposEnsamblado, '2000', false), [tiemposEnsamblado, grupos, restricciones]);

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

  const getTiemposMap = (tiempos: any[]) => {
    const map = new Map<string, number>();
    tiempos.forEach(t => {
      const info = extractMaterialInfo(t);
      if (info.code) {
        const timeVal = Number(t.Tiempo_Min ?? t.Tiempo ?? 0);
        map.set(info.code, timeVal);
      }
    });
    return map;
  };

  const calculateSummary = (data: any[], tMap: Map<string, number>, centroId: string) => {
    const map = new Map<string, { centro: string; maquina: string; categoria: string; espesor: string; totalOrdenes: number; totalCantidad: number; totalTiempoPL: number; totalTiempoCorte: number }>();
    data.forEach(o => {
      const categoria = String(o.CATEGORIA || o.Categoria || o.categoria || '').trim();
      if (!categoria || categoria === 'N/A') return;

      const maquina = String(o.MAQUINA || o.Maquina || o.maquina || 'SIN MÁQUINA').trim();
      const info = extractMaterialInfo(o);
      const espesor = info.esp || '—';
      const key = `${maquina}|${categoria}|${espesor}`;
      
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      const minutesStandard = tMap.get(info.code) || 0;
      const hoursPL = (qty * minutesStandard) / 60;
      const corteHours = (qty * 5) / 3600;

      if (!map.has(key)) {
        map.set(key, { centro: centroId, maquina, categoria, espesor, totalOrdenes: 0, totalCantidad: 0, totalTiempoPL: 0, totalTiempoCorte: 0 });
      }
      const entry = map.get(key)!;
      entry.totalOrdenes += 1;
      entry.totalCantidad += qty;
      entry.totalTiempoPL += hoursPL;
      entry.totalTiempoCorte += corteHours;
    });
    return Array.from(map.values()).sort((a, b) => 
      a.maquina.localeCompare(b.maquina) || a.categoria.localeCompare(b.categoria) || a.espesor.localeCompare(b.espesor)
    );
  };

  const summaryData1000 = useMemo(() => calculateSummary(fertC1000, getTiemposMap(tiemposC1000), '1000'), [fertC1000, tiemposC1000]);
  const summaryData2000 = useMemo(() => calculateSummary(fertC2000, getTiemposMap(tiemposC2000), '2000'), [fertC2000, tiemposC2000]);

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
    const items = [scrollProv, scrollFert, scrollResumen1000, scrollResumen2000];
    const cleaners = items.map(setupScrollSync);
    const timer = setTimeout(() => { items.forEach(s => { if (s.table.current) s.width[1](s.table.current.offsetWidth); }); }, 500);
    return () => { clearTimeout(timer); cleaners.forEach(c => c?.()); };
  }, [activeTab, ordenes, ordenesFert, mounted]);

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Venta Externa...</p>
    </div>
  );

  const renderTableBody = (data: any[], tMap: Map<string, number>) => {
    return data.map((o, i) => {
      const cat = String(o.CATEGORIA || o.Categoria || '').trim();
      const hasCategory = cat !== '' && cat !== 'N/A';
      const info = extractMaterialInfo(o);
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      
      let hoursPL = 0, calculatedCorteHours = 0;

      if (hasCategory) {
        const minutesStandard = tMap.get(info.code) || 0;
        hoursPL = (qty * minutesStandard) / 60;
        calculatedCorteHours = (qty * 5) / 3600;
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
          <td className="px-3 py-3 font-mono font-bold border-r border-dashed border-gray-100 text-indigo-600">{hasCategory ? hoursPL.toFixed(2) : '—'}</td>
          <td className="px-3 py-3 font-mono font-bold border-r border-dashed border-gray-100 text-amber-600 bg-amber-50/5">
            {hasCategory ? calculatedCorteHours.toFixed(2) : '—'}
          </td>
          <td className="px-3 py-3 font-medium text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
        </tr>
      );
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-8 bg-gray-50/50 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-green-600 rounded-2xl shadow-lg shadow-green-100">
            <ShoppingCart className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Venta Externa</h2>
            <p className="text-sm text-gray-500 font-medium">Panel de Control de Programación Táctica</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto w-full bg-transparent gap-3 mb-8 p-0">
          {[
            { id: 'resumen', label: 'Resumen Ejecutivo', icon: LayoutDashboard, color: 'hover:border-purple-500', active: 'data-[state=active]:bg-purple-600 data-[state=active]:text-white' },
            { id: 'grupos', label: 'Grupos Operativos', icon: Users, color: 'hover:border-blue-500', active: 'data-[state=active]:bg-blue-600 data-[state=active]:text-white' },
            { id: 'restricciones', label: 'Filtros Técnicos', icon: Lock, color: 'hover:border-amber-500', active: 'data-[state=active]:bg-amber-600 data-[state=active]:text-white' },
            { id: 'ordenes', label: 'Órdenes Provisionales', icon: Package, color: 'hover:border-green-500', active: 'data-[state=active]:bg-green-600 data-[state=active]:text-white' },
            { id: 'ordenesFert', label: 'Órdenes FERT', icon: ShoppingCart, color: 'hover:border-indigo-500', active: 'data-[state=active]:bg-indigo-600 data-[state=active]:text-white' },
            { id: 'tiempos', label: 'Tiempos Ensamblado', icon: Clock, color: 'hover:border-teal-500', active: 'data-[state=active]:bg-teal-600 data-[state=active]:text-white' },
          ].map(tab => (
            <TabsTrigger 
              key={tab.id} 
              value={tab.id} 
              className={cn(
                "flex-1 min-w-[140px] flex items-center justify-center gap-2 py-4 px-6 rounded-2xl border-2 border-white bg-white shadow-sm transition-all duration-300 font-bold uppercase text-[10px] tracking-wider",
                tab.color,
                tab.active
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-10">
          {[ 
            { t: 'Planta 1000 - Quito', d: summaryData1000, s: scrollResumen1000, c: 'text-green-700', b: 'bg-green-600' }, 
            { t: 'Planta 2000 - Guayaquil', d: summaryData2000, s: scrollResumen2000, c: 'text-indigo-700', b: 'bg-indigo-600' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 px-1">
                <div className="flex items-center gap-3">
                  <div className={cn("w-3 h-3 rounded-full animate-pulse", center.b)} />
                  <h3 className={cn("text-lg font-black uppercase tracking-tight", center.c)}>{center.t}</h3>
                </div>

                {idx === 0 && (
                  <div className="flex items-center gap-2 bg-white p-1 px-3 rounded-xl shadow-sm border border-gray-100 ml-4">
                    <div className="flex items-center gap-2 text-gray-400">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">Filtrar por Fecha FERT:</span>
                    </div>
                    <Select value={selectedDate} onValueChange={setSelectedDate}>
                      <SelectTrigger className="w-[180px] h-8 border-none font-bold text-[10px] bg-transparent focus:ring-0">
                        <SelectValue placeholder="Todas las fechas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">TODAS LAS FECHAS</SelectItem>
                        {fertDates.map(date => (
                          <SelectItem key={date} value={date}>{date}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Badge variant="secondary" className="text-[10px] font-bold ml-auto">{center.d.length} GRUPOS TÉCNICOS</Badge>
              </div>

              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b border-gray-100">
                  <div style={{ width: center.s.width[0], height: '1px' }} />
                </div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[400px]">
                  <table ref={center.s.table} className="w-full border-collapse text-center">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-black uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-5 border-r border-dashed border-gray-200">Recurso / Máquina</th>
                        <th className="px-6 py-5 border-r border-dashed border-gray-200">Categoría Técnica</th>
                        <th className="px-6 py-5 border-r border-dashed border-gray-200">Espesor</th>
                        <th className="px-6 py-5 border-r border-dashed border-gray-200">Órdenes</th>
                        <th className="px-6 py-5 border-r border-dashed border-gray-200">Unidades</th>
                        <th className="px-6 py-5 border-r border-dashed border-gray-200">Tiempo PL</th>
                        <th className="px-6 py-5 text-center text-amber-700 bg-amber-50/20">T. Pl Corte</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[11px]">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={7} className="py-12 text-center text-gray-400 font-medium italic">Sin operaciones programadas</td></tr>
                      ) : (
                        center.d.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50/80 transition-all duration-200">
                            <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-100 uppercase">{row.maquina}</td>
                            <td className="px-6 py-4 font-medium text-gray-500 border-r border-dashed border-gray-100 uppercase">{row.categoria}</td>
                            <td className="px-6 py-4 font-mono font-semibold text-blue-600 border-r border-dashed border-gray-100">{row.espesor}</td>
                            <td className="px-6 py-4 font-mono font-semibold text-purple-700 border-r border-dashed border-gray-100">{row.totalOrdenes}</td>
                            <td className="px-6 py-4 font-mono font-semibold text-green-700 border-r border-dashed border-gray-100">{row.totalCantidad.toLocaleString()}</td>
                            <td className="px-6 py-4 font-mono font-bold text-indigo-700 border-r border-dashed border-gray-100">{row.totalTiempoPL.toFixed(2)}</td>
                            <td className="px-6 py-4 font-mono font-bold text-amber-700 text-center bg-amber-50/5">{row.totalTiempoCorte.toFixed(2)}</td>
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
            { t: 'Planta 1000 - Quito (Provisionales)', d: provC1000, s: scrollProv, b: 'bg-green-600', c: 'text-green-700', tMap: getTiemposMap(tiemposC1000) }, 
            { t: 'Planta 2000 - Guayaquil (Provisionales)', d: provC2000, s: scrollProv, b: 'bg-indigo-600', c: 'text-indigo-700', tMap: getTiemposMap(tiemposC2000) } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className={cn("text-xs font-bold uppercase flex items-center gap-2", center.c)}>
                <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} /> {center.t} ({center.d.length} órdenes)
              </h3>
              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b border-gray-100"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[450px]">
                  <table ref={center.s.table} className="w-full border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-[8px] font-black uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Orden</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Fecha Inicio</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Material</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Categoría</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">DENS.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">ANCHO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">LARGO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">ESP.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Cant.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Tiempo PL</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-amber-700 bg-amber-50/30 text-center">T. Pl Corte</th>
                        <th className="px-3 py-4 text-center">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {renderTableBody(center.d, center.tMap)}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="ordenesFert" className="mt-4 space-y-8">
          {[ 
            { t: 'Planta 1000 - Quito (FERT)', d: fertC1000, s: scrollFert, b: 'bg-indigo-600', c: 'text-indigo-700', tMap: getTiemposMap(tiemposC1000) }, 
            { t: 'Planta 2000 - Guayaquil (FERT)', d: fertC2000, s: scrollFert, b: 'bg-blue-600', c: 'text-blue-700', tMap: getTiemposMap(tiemposC2000) } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className={cn("text-xs font-bold uppercase flex items-center gap-2", center.c)}>
                <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} /> {center.t} ({center.d.length} materiales)
              </h3>
              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b border-gray-100"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[450px]">
                  <table ref={center.s.table} className="w-full border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-[8px] font-black uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Orden</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Fecha Inicio</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Material</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Categoría</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">DENS.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">ANCHO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">LARGO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">ESP.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Cant.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Tiempo PL</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-amber-700 bg-amber-50/30 text-center">T. Pl Corte</th>
                        <th className="px-3 py-4 text-center">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {renderTableBody(center.d, center.tMap)}
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
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-600" />
                <Badge className="w-fit bg-blue-600 mb-2">PLANTA {g.centro}</Badge>
                <h4 className="font-bold text-gray-800 uppercase text-lg leading-tight">{g.nombre_grupo}</h4>
                <p className="text-[10px] font-mono text-gray-400 mt-1 uppercase">Código Interno: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones" className="mt-4">
          <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200 text-center">Parámetro Técnico</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200 text-center">Valor Configurado</th>
                  <th className="px-6 py-5 text-left">Descripción Operativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px]">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-amber-50/20">
                    <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-200 uppercase text-center">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-dashed border-gray-200 text-center">
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
          {[ { t: 'Catálogo Técnico - Quito 1000', d: tiemposC1000, s: scrollProv, c: 'text-teal-700', b: 'bg-teal-600' }, { t: 'Catálogo Técnico - Guayaquil 2000', d: tiemposC2000, s: scrollProv, c: 'text-cyan-700', b: 'bg-cyan-600' } ].map((center, idx) => (
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
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-center">Línea Prod.</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-teal-700 text-center">Estándar (Min)</th>
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
                            <td className="px-4 py-3 border-r border-dashed border-gray-200 text-center font-medium text-gray-400 uppercase">{t.Linea || '—'}</td>
                            <td className="px-4 py-3 font-mono font-bold text-teal-600 border-r border-dashed border-gray-100 text-center">{(t.Tiempo_Min || t.Tiempo || 0).toFixed(2)}</td>
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