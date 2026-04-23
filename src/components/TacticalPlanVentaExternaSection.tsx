'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, Clock, LayoutDashboard, Calendar as CalendarIcon, Filter } from 'lucide-react';
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
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Refs para sincronización de scroll
  const scrollProv1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollProv2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollFert1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollFert2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollResumen = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

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
          const data = res.data?.data || res.data || [];
          if (Array.isArray(data)) allTiempos.push(...data);
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

  // Lista única de fechas para el filtro cronológico
  const uniqueDates = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => { if (o.FECHAINICIO) dates.add(String(o.FECHAINICIO).trim()); });
    ordenesFert.forEach(o => { if (o.FECHA) dates.add(String(o.FECHA).trim()); });
    return Array.from(dates).sort().reverse();
  }, [ordenes, ordenesFert]);

  const filterData = (data: any[], centro: string) => {
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

      const itemDate = String(o.FECHA || o.FECHAINICIO || '').trim();
      const matchDate = !selectedDate || itemDate === selectedDate;

      return matchResp && matchAlm && matchSector && matchDate;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restricciones, selectedDate]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restricciones, selectedDate]);
  const fertC1000 = useMemo(() => filterData(ordenesFert, '1000'), [ordenesFert, grupos, restricciones, selectedDate]);
  const fertC2000 = useMemo(() => filterData(ordenesFert, '2000'), [ordenesFert, grupos, restricciones, selectedDate]);
  const tiemposC1000 = useMemo(() => filterData(tiemposEnsamblado, '1000'), [tiemposEnsamblado, grupos, restricciones, selectedDate]);
  const tiemposC2000 = useMemo(() => filterData(tiemposEnsamblado, '2000'), [tiemposEnsamblado, grupos, restricciones, selectedDate]);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    return { code, desc };
  };

  const tiemposMap1000 = useMemo(() => {
    const map = new Map<string, number>();
    tiemposC1000.forEach(t => {
      const info = extractMaterialInfo(t);
      if (info.code) map.set(info.code, Number(t.Tiempo_Min ?? t.Tiempo ?? 0));
    });
    return map;
  }, [tiemposC1000]);

  const tiemposMap2000 = useMemo(() => {
    const map = new Map<string, number>();
    tiemposC2000.forEach(t => {
      const info = extractMaterialInfo(t);
      if (info.code) map.set(info.code, Number(t.Tiempo_Min ?? t.Tiempo ?? 0));
    });
    return map;
  }, [tiemposC2000]);

  const summaryData = useMemo(() => {
    const allFertFiltered = [...fertC1000, ...fertC2000];
    const map = new Map<string, { centro: string; maquina: string; categoria: string; totalOrdenes: number; totalCantidad: number; totalTiempo: number }>();
    
    allFertFiltered.forEach(o => {
      const centro = String(o.CENTRO || o.Centro || o.centro || '').trim();
      const maquina = String(o.MAQUINA || o.Maquina || o.maquina || 'SIN MÁQUINA').trim();
      const categoria = String(o.CATEGORIA || o.Categoria || o.categoria || 'N/A').trim();
      const key = `${centro}|${maquina}|${categoria}`;
      
      const info = extractMaterialInfo(o);
      const tMap = centro === '1000' ? tiemposMap1000 : tiemposMap2000;
      const matchingTimeMin = tMap.get(info.code) || 0;
      const cantPendiente = Number(o.CANTPENDIENTE ?? 0);
      const hours = (cantPendiente * matchingTimeMin) / 60;

      if (!map.has(key)) {
        map.set(key, { centro, maquina, categoria, totalOrdenes: 0, totalCantidad: 0, totalTiempo: 0 });
      }
      const entry = map.get(key)!;
      entry.totalOrdenes += 1;
      entry.totalCantidad += Number(o.CANTPROGRAMADA || 0);
      entry.totalTiempo += hours;
    });
    
    return Array.from(map.values()).sort((a, b) => 
      a.centro.localeCompare(b.centro) || 
      a.maquina.localeCompare(b.maquina) ||
      a.categoria.localeCompare(b.categoria)
    );
  }, [fertC1000, fertC2000, tiemposMap1000, tiemposMap2000]);

  const setupScrollSync = (group: any) => {
    if (!group.top.current || !group.bottom.current) return;
    const syncB = () => { if (group.bottom.current) group.bottom.current.scrollLeft = group.top.current.scrollLeft; };
    const syncT = () => { if (group.top.current) group.top.current.scrollLeft = group.bottom.current.scrollLeft; };
    group.top.current.addEventListener('scroll', syncB);
    group.bottom.current.addEventListener('scroll', syncT);
    return () => {
      group.top.current?.removeEventListener('scroll', syncB);
      group.bottom.current?.removeEventListener('scroll', syncT);
    };
  };

  useEffect(() => {
    if (!mounted) return;
    const items = [scrollProv1000, scrollProv2000, scrollFert1000, scrollFert2000, scrollTiempos1000, scrollTiempos2000, scrollResumen];
    const cleaners = items.map(setupScrollSync);
    setTimeout(() => items.forEach(s => { if (s.table.current) s.width[1](s.table.current.offsetWidth); }), 500);
    return () => cleaners.forEach(c => c?.());
  }, [activeTab, ordenes, ordenesFert, tiemposEnsamblado, mounted]);

  if (!mounted || isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <Loader2 className="w-12 h-12 animate-spin text-green-600" />
      <p className="text-sm font-bold text-gray-500 uppercase tracking-widest animate-pulse">Sincronizando Venta Externa...</p>
    </div>
  );

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

        {/* Filtro de Fecha Interno */}
        <div className="flex items-center gap-3 bg-white p-2 px-4 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-400">
            <CalendarIcon className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Fecha Plan:</span>
          </div>
          <select 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs font-bold text-gray-700 bg-transparent border-none focus:ring-0 cursor-pointer"
          >
            <option value="">TODAS LAS FECHAS</option>
            {uniqueDates.map(date => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
          {selectedDate && (
            <button 
              onClick={() => setSelectedDate('')}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-red-500" />
            </button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto w-full bg-transparent gap-3 mb-8 p-0">
          {[
            { id: 'resumen', label: 'Resumen Ejecutivo', icon: LayoutDashboard, color: 'hover:border-purple-500', active: 'data-[state=active]:bg-purple-600 data-[state=active]:text-white' },
            { id: 'grupos', label: 'Grupos Operativos', icon: Users, color: 'hover:border-blue-500', active: 'data-[state=active]:bg-blue-600 data-[state=active]:text-white' },
            { id: 'restricciones', label: 'Restricciones Técnicas', icon: Lock, color: 'hover:border-amber-500', active: 'data-[state=active]:bg-amber-600 data-[state=active]:text-white' },
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

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-xl transition-all duration-300 border-none rounded-3xl bg-white p-6">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-600" />
                <Badge className="w-fit bg-blue-600 mb-2">PLANTA {g.centro}</Badge>
                <h4 className="font-black text-gray-800 uppercase text-lg leading-tight">{g.nombre_grupo}</h4>
                <p className="text-[10px] font-mono text-gray-400 mt-1">CÓDIGO: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50/50 text-[10px] font-black uppercase text-gray-400">
                <tr>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200 text-center">Parámetro Técnico</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200 text-center">Valor Configurado</th>
                  <th className="px-6 py-5 text-left">Descripción Operativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px]">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-amber-50/20">
                    <td className="px-6 py-4 font-black text-gray-700 border-r border-dashed border-gray-200 uppercase text-center">{r.nombre_restriccion}</td>
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

        <TabsContent value="ordenes" className="space-y-8">
          {[ { t: 'Quito 1000', d: provC1000, s: scrollProv1000, c: 'text-green-700', b: 'bg-green-600' }, { t: 'Guayaquil 2000', d: provC2000, s: scrollProv2000, c: 'text-indigo-700', b: 'bg-indigo-600' } ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <h3 className={cn("text-xs font-black uppercase flex items-center gap-2", center.c)}>
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} /> {center.t} ({center.d.length})
                </h3>
              </div>
              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[400px]">
                  <table ref={center.s.table} className="w-full border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10 text-[9px] font-black uppercase text-gray-400">
                      <tr>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-center">Orden</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-center">Material</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-left">Descripción</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-center">Cant.</th>
                        <th className="px-4 py-4 text-center">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[11px]">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        return (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-bold text-gray-900 border-r border-dashed border-gray-100 text-center">{o.ORDENPREVISIONAL || '—'}</td>
                            <td className="px-4 py-3 font-mono font-black text-green-600 border-r border-dashed border-gray-100 text-center">{info.code}</td>
                            <td className="px-4 py-3 text-left border-r border-dashed border-gray-100 truncate max-w-[300px] font-medium text-gray-500 uppercase">{info.desc}</td>
                            <td className="px-4 py-3 font-black text-gray-900 border-r border-dashed border-gray-100 text-center text-sm">{o.CANTPROGRAMADA || '0'}</td>
                            <td className="px-4 py-3 font-bold text-gray-400 text-center">{o.Almacen || '—'}</td>
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

        <TabsContent value="ordenesFert" className="space-y-8">
          {[ 
            { t: 'Quito 1000 (FERT)', d: fertC1000, s: scrollFert1000, c: 'text-indigo-700', b: 'bg-indigo-600', m: tiemposMap1000 }, 
            { t: 'Guayaquil 2000 (FERT)', d: fertC2000, s: scrollFert2000, c: 'text-blue-700', b: 'bg-blue-600', m: tiemposMap2000 } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <h3 className={cn("text-xs font-black uppercase flex items-center gap-2", center.c)}>
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} /> {center.t} ({center.d.length})
                </h3>
              </div>
              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[450px]">
                  <table ref={center.s.table} className="w-full border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10 text-[8px] font-black uppercase text-gray-400 tracking-tighter">
                      <tr>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Orden</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Material</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Sector</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Categoría</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 bg-blue-50/30 text-blue-800 text-center">Prog.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 bg-green-50/30 text-green-800 text-center">Ent.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 bg-blue-50/30 text-blue-800 text-center">Not.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 bg-red-50/30 text-red-800 text-center">Rech.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 bg-orange-50/30 text-orange-800 text-center">Pend.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">T. Pend (m)</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-teal-700 bg-teal-50/30 font-black text-center">Tiempo PL (h)</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Fecha</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Resp.</th>
                        <th className="px-3 py-4 text-center">Máquina</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[10px]">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        const matchingTimeMin = center.m.get(info.code);
                        const cantPendiente = Number(o.CANTPENDIENTE ?? 0);
                        const calculatedHours = matchingTimeMin !== undefined ? (cantPendiente * matchingTimeMin) / 60 : null;
                        
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-3 font-bold border-r border-dashed border-gray-100 text-center">{o.ORDEN || '—'}</td>
                            <td className="px-3 py-3 font-mono font-black text-indigo-600 border-r border-dashed border-gray-100 text-center">{info.code}</td>
                            <td className="px-3 py-3 text-left border-r border-dashed border-gray-100 truncate max-w-[180px] font-black text-gray-500 uppercase tracking-tighter">{info.desc}</td>
                            <td className="px-3 py-3 text-gray-400 font-bold border-r border-dashed border-gray-100 text-center">{o.SECTORDESC || '—'}</td>
                            <td className="px-3 py-3 text-gray-400 font-bold border-r border-dashed border-gray-100 text-center">{o.CATEGORIA || '—'}</td>
                            <td className="px-3 py-3 font-black text-blue-800 border-r border-dashed border-gray-100 text-center bg-blue-50/10 text-xs">{o.CANTPROGRAMADA || 0}</td>
                            <td className="px-3 py-3 font-black text-green-700 border-r border-dashed border-gray-100 text-center bg-green-50/10 text-xs">{o.CANTENTREGADA || 0}</td>
                            <td className="px-3 py-3 font-black text-blue-700 border-r border-dashed border-gray-100 text-center bg-blue-50/10 text-xs">{o.CANTNOTIFICADA || 0}</td>
                            <td className="px-3 py-3 font-black text-red-600 border-r border-dashed border-gray-100 text-center bg-red-50/10 text-xs">{o.CANTRECHAZO || 0}</td>
                            <td className="px-3 py-3 font-black text-orange-600 border-r border-dashed border-gray-100 text-center bg-orange-50/10 text-xs">{cantPendiente}</td>
                            <td className="px-3 py-3 font-mono font-bold border-r border-dashed border-gray-100 text-center">{o.TIEMPOPENDIENTE || 0}</td>
                            <td className="px-3 py-3 font-mono font-black border-r border-dashed border-gray-100 text-center text-teal-600 bg-teal-50/5 text-xs">
                              {calculatedHours !== null ? `${calculatedHours.toFixed(2)}h` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-3 font-bold text-gray-600 border-r border-dashed border-gray-100 text-center whitespace-nowrap">{o.FECHA || '—'}</td>
                            <td className="px-3 py-3 font-black text-gray-400 border-r border-dashed border-gray-100 text-center">{o.RESPCTRLPROD || '—'}</td>
                            <td className="px-3 py-3 font-medium text-gray-400 text-center">{o.MAQUINA || '—'}</td>
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

        <TabsContent value="tiempos" className="space-y-8">
          {[ { t: 'Catálogo Quito 1000', d: tiemposC1000, s: scrollTiempos1000, c: 'text-teal-700', b: 'bg-teal-600' }, { t: 'Catálogo Guayaquil 2000', d: tiemposC2000, s: scrollTiempos2000, c: 'text-cyan-700', b: 'bg-cyan-600' } ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <h3 className={cn("text-xs font-black uppercase flex items-center gap-2", center.c)}>
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} /> {center.t} ({center.d.length})
                </h3>
              </div>
              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[450px]">
                  <table ref={center.s.table} className="w-full border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10 text-[9px] font-black uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-center">Material</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-left">Descripción</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-center">Línea Técnica</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-teal-700 text-center">T. Estándar (Min)</th>
                        <th className="px-4 py-4 text-center">S. Actual / Seguridad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[11px]">
                      {center.d.map((t, i) => {
                        const info = extractMaterialInfo(t);
                        return (
                          <tr key={i} className="hover:bg-teal-50/20 transition-colors">
                            <td className="px-4 py-3 font-mono font-black text-teal-700 border-r border-dashed border-gray-100 text-center tracking-tighter">{info.code}</td>
                            <td className="px-4 py-3 text-left border-r border-dashed border-gray-100 font-black text-gray-500 uppercase tracking-tighter truncate max-w-[280px]">{info.desc}</td>
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 text-center font-bold text-gray-400">{t.Linea || '—'}</td>
                            <td className="px-4 py-3 font-mono font-black text-teal-600 border-r border-dashed border-gray-100 text-center text-lg">{(t.Tiempo_Min || t.Tiempo || 0).toFixed(2)}m</td>
                            <td className="px-4 py-3 text-center font-bold text-gray-400">{t.StockActual || 0} / {t.StockSeguridad || 0}</td>
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

        <TabsContent value="resumen">
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
              <h3 className="text-xs font-black uppercase text-purple-700 tracking-tight">Resumen Ejecutivo por Planta y Recurso</h3>
              <Badge variant="secondary" className="ml-2 text-[9px] h-4 font-bold bg-purple-50 text-purple-700 border-purple-100">
                {summaryData.length} Grupos Técnicos {selectedDate ? `para ${selectedDate}` : ''}
              </Badge>
            </div>
            
            <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
              <div ref={scrollResumen.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b">
                <div style={{ width: scrollResumen.width[0], height: '1px' }} />
              </div>
              
              <div ref={scrollResumen.bottom} className="overflow-x-auto max-h-[650px]">
                <table ref={scrollResumen.table} className="w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10 text-[10px] font-black uppercase text-gray-400 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-5 border-r border-dashed border-gray-200 text-center">Planta</th>
                      <th className="px-6 py-5 border-r border-dashed border-gray-200 text-center">Recurso / Máquina</th>
                      <th className="px-6 py-5 border-r border-dashed border-gray-200 text-center">Categoría Técnica</th>
                      <th className="px-6 py-5 border-r border-dashed border-gray-200 text-center bg-purple-50/30 text-purple-800">Ordenes</th>
                      <th className="px-6 py-5 border-r border-dashed border-gray-200 text-center bg-green-50/30 text-green-800">Unidades</th>
                      <th className="px-6 py-5 text-center bg-teal-50/30 text-teal-800">Tiempo Total (h)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {summaryData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400 italic font-medium">No hay órdenes cargadas para los filtros seleccionados.</td>
                      </tr>
                    ) : (
                      summaryData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/80 transition-all duration-200">
                          <td className="px-6 py-4 border-r border-dashed border-gray-100 text-center">
                            <Badge className={cn(
                              "font-black px-4 py-1 tracking-widest text-[10px]",
                              row.centro === '1000' ? "bg-green-600 hover:bg-green-700" : "bg-indigo-600 hover:bg-indigo-700"
                            )}>
                              {row.centro === '1000' ? 'QUITO' : 'GYE'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 font-black text-gray-700 border-r border-dashed border-gray-100 text-center uppercase tracking-tighter">
                            {row.maquina}
                          </td>
                          <td className="px-6 py-4 font-bold text-gray-500 border-r border-dashed border-gray-100 text-center uppercase">
                            {row.categoria}
                          </td>
                          <td className="px-6 py-4 font-mono font-black text-purple-700 border-r border-dashed border-gray-100 text-center text-sm bg-purple-50/5">
                            {row.totalOrdenes}
                          </td>
                          <td className="px-6 py-4 font-mono font-black text-green-700 border-r border-dashed border-gray-100 text-center text-sm bg-green-50/5">
                            {row.totalCantidad.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 font-mono font-black text-teal-700 text-center text-sm bg-teal-50/5">
                            {row.totalTiempo.toFixed(2)}h
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {summaryData.length > 0 && (
                    <tfoot className="bg-gray-900 text-white font-black text-[10px] uppercase">
                      <tr>
                        <td colSpan={3} className="px-6 py-5 text-right border-r border-gray-800 tracking-widest">Totales Consolidados</td>
                        <td className="px-6 py-5 text-center border-r border-gray-800 text-purple-400 text-xs font-mono">
                          {summaryData.reduce((acc, curr) => acc + curr.totalOrdenes, 0)}
                        </td>
                        <td className="px-6 py-5 text-center border-r border-gray-800 text-green-400 text-xs font-mono">
                          {summaryData.reduce((acc, curr) => acc + curr.totalCantidad, 0).toLocaleString()}
                        </td>
                        <td className="px-6 py-5 text-center text-teal-400 text-xs font-mono">
                          {summaryData.reduce((acc, curr) => acc + curr.totalTiempo, 0).toFixed(2)}h
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
