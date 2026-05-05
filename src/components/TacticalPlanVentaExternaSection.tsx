'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, Clock, LayoutDashboard, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, ClipboardList } from 'lucide-react';
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

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions: any = { dens: '—', ancho: '—', largo: '—', esp: '—', tipo: '—' };
    
    // Lógica sincronizada con Formulación/Espumas
    const techPatternMatch = catStr.match(/D(\d+)([a-zA-Z]+)/i);
    
    if (techPatternMatch) {
      dimensions.dens = techPatternMatch[1]; 
      dimensions.tipo = techPatternMatch[2].toUpperCase(); 
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

  const calculateSummary = (data: any[], tMap: Map<string, number>, centroId: string) => {
    const map = new Map<string, { centro: string; maquina: string; categoria: string; espesor: string; tipo: string; totalOrdenes: number; totalCantidad: number; totalTiempoPL: number; totalTiempoCorte: number }>();
    data.forEach(o => {
      const categoria = String(o.CATEGORIA || o.Categoria || o.categoria || '').trim();
      if (!categoria || categoria === 'N/A') return;

      const maquina = String(o.MAQUINA || o.Maquina || o.maquina || o.RECURSO || 'SIN MÁQUINA').trim();
      const info = extractMaterialInfo(o);
      const espesor = info.esp || '—';
      const tipo = info.tipo || '—';
      const key = `${maquina}|${categoria}|${espesor}|${tipo}`;
      
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      const minutesStandard = tMap.get(info.code) || 0;
      const hoursPL = (qty * minutesStandard) / 60;
      const corteHours = (qty * 5) / 3600;

      if (!map.has(key)) {
        map.set(key, { centro: centroId, maquina, categoria, espesor, tipo, totalOrdenes: 0, totalCantidad: 0, totalTiempoPL: 0, totalTiempoCorte: 0 });
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

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Venta Externa...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-green-600/10 rounded-xl"><ShoppingCart className="w-6 h-6 text-green-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Táctico Venta Externa</h2>
            <p className="text-xs text-gray-500 font-medium">Control de Órdenes FERT y Programación Técnica</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-6 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Resumen', i: LayoutDashboard }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Filtros', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'ordenesFert', l: 'FERT', i: ShoppingCart }, 
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
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Fecha de Programación</p>
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'Consolidado General' : selectedDate}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedDate} onValueChange={setSelectedDate}>
                <SelectTrigger className="w-[180px] h-8 font-bold text-[10px] uppercase rounded-xl border-gray-200">
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
          </div>

          {[ 
            { t: 'Planta 1000 - Quito', d: summaryData1000, c: 'text-green-700', b: 'bg-green-600' }, 
            { t: 'Planta 2000 - Guayaquil', d: summaryData2000, c: 'text-indigo-700', b: 'bg-indigo-600' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1", center.c)}>
                <div className={cn("w-2 h-2 rounded-full", center.b)} /> {center.t}
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[400px]">
                  <table className="w-full border-collapse text-center font-sans">
                    <thead className="bg-gray-100/80 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 border-r border-gray-100">Máquina / Recurso</th>
                        <th className="px-6 py-4 border-r border-gray-100">Categoría Técnica</th>
                        <th className="px-6 py-4 border-r border-gray-100 text-primary">Tipo</th>
                        <th className="px-6 py-4 border-r border-gray-100 bg-blue-50/50 text-blue-800">Espesor</th>
                        <th className="px-6 py-4 border-r border-gray-100">Total Órdenes</th>
                        <th className="px-6 py-4 border-r border-gray-100 font-black">Total Unidades</th>
                        <th className="px-6 py-4 border-r border-gray-100 text-indigo-700 font-bold bg-indigo-50/20">Tiempo PL (H)</th>
                        <th className="px-6 py-4 text-center text-teal-700 bg-teal-50/20 font-black">T. Pl Corte (H)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[10px]">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={8} className="py-12 text-center text-gray-400 italic">No hay operaciones programadas para esta fecha</td></tr>
                      ) : (
                        center.d.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                            <td className="px-6 py-3 font-bold text-gray-700 border-r border-gray-50 uppercase">{row.maquina}</td>
                            <td className="px-6 py-3 font-medium text-gray-500 border-r border-gray-50 uppercase">{row.categoria}</td>
                            <td className="px-6 py-3 font-black text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                            <td className="px-6 py-3 font-bold text-blue-700 border-r border-gray-50 bg-blue-50/5">{row.espesor}</td>
                            <td className="px-6 py-3 font-mono border-r border-gray-50">{row.totalOrdenes}</td>
                            <td className="px-6 py-3 font-mono font-bold text-gray-900 border-r border-gray-50">{row.totalCantidad.toLocaleString()}</td>
                            <td className="px-6 py-3 font-mono font-bold text-indigo-600 border-r border-gray-50 bg-indigo-50/5">{row.totalTiempoPL.toFixed(2)}</td>
                            <td className="px-6 py-3 font-mono font-black text-teal-600 text-center bg-teal-50/5">{row.totalTiempoCorte.toFixed(2)}</td>
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

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-6">
                <div className="absolute top-0 left-0 w-1 h-full bg-green-600 group-hover:bg-green-700" />
                <Badge className="bg-green-50 text-green-700 mb-2 font-bold text-[9px] uppercase border-green-200">PLANTA {g.centro}</Badge>
                <h4 className="font-bold text-gray-800 uppercase text-sm">{g.nombre_grupo}</h4>
                <p className="text-[9px] font-mono text-gray-400 mt-2">ID: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-gray-100/50 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Parámetro de Filtro</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Valores Permitidos</th>
                  <th className="px-6 py-5 text-left">Efecto en Planificación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px]">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-200 uppercase">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-dashed border-gray-200">
                      <Badge variant="outline" className="font-mono text-indigo-700 border-indigo-200 bg-indigo-50/50">{r.valor_restriccion}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-8">
          {[ 
            { t: 'Quito 1000 - Órdenes Provisionales', d: provC1000, tMap: getTiemposMap(tiemposC1000), b: 'bg-green-600', c: 'text-green-700' }, 
            { t: 'Guayaquil 2000 - Órdenes Provisionales', d: provC2000, tMap: getTiemposMap(tiemposC2000), b: 'bg-indigo-600', c: 'text-indigo-700' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1", center.c)}>
                <div className={cn("w-2 h-2 rounded-full", center.b)} /> {center.t} ({center.d.length} registros)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[450px]">
                  <table className="w-full border-collapse text-center">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/20 text-blue-900">Categoría</th>
                        <th className="px-2 py-4 border-r border-gray-100">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-100">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-100">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-100">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100">Cant.</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-indigo-700">T. PL (H)</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-teal-700 bg-teal-50/20">T. Corte (H)</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-bold">Máquina</th>
                        <th className="px-3 py-4">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[10px]">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                        const minutesStandard = center.tMap.get(info.code) || 0;
                        const hoursPL = (qty * minutesStandard) / 60;
                        const corteHours = (qty * 5) / 3600;
                        
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                            <td className="px-3 py-2 border-r border-gray-50 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                            <td className="px-3 py-2 font-mono font-bold text-primary border-r border-gray-50 tracking-tighter">{info.code}</td>
                            <td className="px-3 py-2 text-left border-r border-gray-50 truncate max-w-[180px] text-gray-500 uppercase">{info.desc}</td>
                            <td className="px-3 py-2 text-blue-800 border-r border-gray-50 bg-blue-50/5 uppercase font-bold">{String(o.CATEGORIA || '—')}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.dens}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.ancho}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.largo}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.esp}</td>
                            <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-50 font-mono">{qty}</td>
                            <td className="px-3 py-2 font-mono font-bold text-indigo-600 border-r border-gray-50">{hoursPL.toFixed(2)}</td>
                            <td className="px-3 py-2 font-mono font-bold text-teal-600 border-r border-gray-50 bg-teal-50/10">{corteHours.toFixed(2)}</td>
                            <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-50 uppercase">{o.MAQUINA || o.Maquina || o.RECURSO || '—'}</td>
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

        <TabsContent value="ordenesFert" className="space-y-8">
          {[ 
            { t: 'Quito 1000 - Órdenes FERT', d: fertC1000, tMap: getTiemposMap(tiemposC1000), b: 'bg-green-600', c: 'text-green-700' }, 
            { t: 'Guayaquil 2000 - Órdenes FERT', d: fertC2000, tMap: getTiemposMap(tiemposC2000), b: 'bg-indigo-600', c: 'text-indigo-700' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1", center.c)}>
                <div className={cn("w-2 h-2 rounded-full", center.b)} /> {center.t} ({center.d.length} registros)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[450px]">
                  <table className="w-full border-collapse text-center font-sans">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/20 text-blue-900 font-black">Categoría</th>
                        <th className="px-2 py-4 border-r border-gray-100">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-100">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-100">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-100">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100">Cant.</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-indigo-700 font-black">T. PL (H)</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-teal-700 bg-teal-50/20 font-black">T. Corte (H)</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-bold">Máquina</th>
                        <th className="px-3 py-4">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[10px]">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                        const minutesStandard = center.tMap.get(info.code) || 0;
                        const hoursPL = (qty * minutesStandard) / 60;
                        const corteHours = (qty * 5) / 3600;
                        
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-50">{o.ORDEN || '—'}</td>
                            <td className="px-3 py-2 border-r border-gray-50 font-mono text-[9px] text-gray-400">{o.FECHA || '—'}</td>
                            <td className="px-3 py-2 font-mono font-bold text-primary border-r border-gray-100 tracking-tighter">{info.code}</td>
                            <td className="px-3 py-2 text-left border-r border-gray-50 truncate max-w-[180px] text-gray-500 uppercase">{info.desc}</td>
                            <td className="px-3 py-2 text-blue-800 border-r border-gray-50 bg-blue-50/5 uppercase font-black">{String(o.CATEGORIA || '—')}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.dens}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.ancho}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.largo}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.esp}</td>
                            <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-50 font-mono">{qty}</td>
                            <td className="px-3 py-2 font-mono font-bold text-indigo-600 border-r border-gray-50">{hoursPL.toFixed(2)}</td>
                            <td className="px-3 py-2 font-mono font-bold text-teal-600 border-r border-gray-50 bg-teal-50/10">{corteHours.toFixed(2)}</td>
                            <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-50 uppercase">{o.MAQUINA || o.RECURSO || '—'}</td>
                            <td className="px-3 py-2 font-medium text-gray-400">{o.ALMACEN || '—'}</td>
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
            {[ 
              { t: 'Catálogo de Tiempos - Quito 1000', d: tiemposC1000, c: 'text-teal-700', b: 'bg-teal-600' }, 
              { t: 'Catálogo de Tiempos - Guayaquil 2000', d: tiemposC2000, c: 'text-cyan-700', b: 'bg-cyan-600' } 
            ].map((center, idx) => (
              <div key={idx} className="space-y-4">
                <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1", center.c)}>
                  <div className={cn("w-2 h-2 rounded-full", center.b)} /> {center.t}
                </h3>
                <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full border-collapse text-center">
                      <thead className="bg-gray-100 sticky top-0 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-4 border-r border-gray-100">Material</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                          <th className="px-4 py-4 border-r border-gray-100">Línea Técnica</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-teal-600">Estándar (Min)</th>
                          <th className="px-4 py-4">Inventario / Seguridad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-[10px]">
                        {center.d.length === 0 ? (
                          <tr><td colSpan={5} className="py-12 text-center text-gray-400 italic">No hay tiempos técnicos registrados para este centro</td></tr>
                        ) : (
                          center.d.map((t, i) => {
                            const info = extractMaterialInfo(t);
                            return (
                              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3 font-mono font-bold text-primary border-r border-gray-50">{info.code}</td>
                                <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[300px]">{info.desc}</td>
                                <td className="px-4 py-3 border-r border-gray-100 font-bold text-gray-400 uppercase">{t.Linea || t.PuestoTrabajoLinea || '—'}</td>
                                <td className="px-4 py-3 font-mono font-bold text-teal-600 border-r border-gray-50">{(t.Tiempo_Min || t.Tiempo || 0).toFixed(4)}</td>
                                <td className="px-4 py-3 text-gray-400 font-mono">{(t.StockActual || 0)} / {(t.StockSeguridad || 0)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
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
