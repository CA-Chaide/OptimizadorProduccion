'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wind, Users, Lock, Package, Loader2, Clock, LayoutDashboard, Truck } from 'lucide-react';
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

// Constantes de tiempo para el método de Carga/Descarga (en minutos)
const TIME_LOAD_BLOCK = 5;      // 5 min por subir un bloque
const TIME_UNLOAD_PAIR = 0.75;  // 45 seg por descargar una pareja
const TIME_CART_SWAP = 1;       // 1 min por cambiar de coche

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
      return matchResp && matchAlm;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restricciones]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restricciones]);
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
      const date = String(item.FECHAINICIO || item.FECHA || 'N/A').trim();
      const key = `${cat}-${date}-${info.ancho}-${info.largo}-${info.esp}`;
      const qty = Number(item.CANTPROGRAMADA || item.CANTIDAD || 0);
      const esp = parseFloat(info.esp) || 0;
      const alturaTotal = esp * qty;
      map.set(key, (map.get(key) || 0) + alturaTotal);
    });
    return map;
  };

  const groupTotals1000 = useMemo(() => calculateGroupTotals(provC1000), [provC1000]);
  const groupTotals2000 = useMemo(() => calculateGroupTotals(provC2000), [provC2000]);

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

  const calculateCargaDescargaTime = (qty: number, espesor: number, cargasB7: number) => {
    if (qty <= 0) return 0;
    // Carga: 5 min por cada carga de bloque (lote B7)
    const loadTime = (Math.max(1, Math.ceil(cargasB7))) * TIME_LOAD_BLOCK;
    // Descarga: pareja de láminas
    const unloadMoves = Math.ceil(qty / 2);
    // Capacidad de coche: depende del espesor
    const movesPerCart = espesor > 10 ? 4 : 3;
    const cartsNeeded = Math.ceil(unloadMoves / movesPerCart);
    // Tiempo descarga = (movimientos * tiempo_mov) + (coches * tiempo_cambio)
    const unloadTime = (unloadMoves * TIME_UNLOAD_PAIR) + (cartsNeeded * TIME_CART_SWAP);
    return (loadTime + unloadTime) / 60; // Retorna en Horas
  };

  const calculateSummary = (data: any[], tMap: Map<string, number>) => {
    const groupsMap = new Map<string, { fecha: string; categoria: string; ancho: string; largo: string; espesor: string; items: any[] }>();
    
    data.forEach(o => {
      const fecha = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
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
        const timePerUnit = tMap.get(info.code) || 0;
        return { qty, esp, dens, timePerUnit };
      });

      const totalUnidades = infoItems.reduce((sum, i) => sum + i.qty, 0);
      const totalAltura = infoItems.reduce((sum, i) => sum + (i.esp * i.qty), 0);
      const firstDens = infoItems[0]?.dens || 0;
      const alturaUtil = firstDens < 30 ? 103 : 85;

      const nroSubbloques = totalAltura / (alturaUtil || 1);
      const cargasB7 = nroSubbloques / 7;
      const residuo = nroSubbloques % 7;
      
      const cantApoyo = (residuo > 0 && residuo <= 2) ? residuo : 0;
      const cargaExtraPrincipal = (residuo > 2) ? 1 : 0;
      
      const espVal = parseFloat(group.espesor) || 1;
      const nCycles = Math.floor(alturaUtil / espVal) + 4;
      
      const totalTimeCatalog = infoItems.reduce((sum, i) => sum + (i.qty * i.timePerUnit), 0) / 60;
      const tiempoCorteCalculado = (nCycles * totalTimeCatalog) * (cargasB7 || 1);
      
      const tiempoLogistico = calculateCargaDescargaTime(totalUnidades, espVal, cargasB7);

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
        cargasB7,
        cantApoyo,
        cargaExtraPrincipal,
        nCycles,
        totalTimeCatalog,
        tiempoCorteCalculado,
        tiempoLogistico
      };
    }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.categoria.localeCompare(b.categoria));
  };

  const summaryData1000 = useMemo(() => calculateSummary(provC1000, getTiemposMap(tiemposC1000)), [provC1000, tiemposC1000]);
  const summaryData2000 = useMemo(() => calculateSummary(provC2000, getTiemposMap(tiemposC2000)), [provC2000, tiemposC2000]);

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

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Corte Espuma...</p>
    </div>
  );

  const renderTableBody = (data: any[], gTotals: Map<string, number>, tMap: Map<string, number>) => {
    return data.map((o, i) => {
      const cat = String(o.CATEGORIA || o.Categoria || '').trim();
      const hasCategory = cat !== '' && cat !== 'N/A';
      const info = extractMaterialInfo(o);
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);

      let volume = 0, weight = 0, alturaTotal = 0, groupSum = 0, alturaUtil: any = 103, nCycles = 0, timeCatalog = 0, nSub = 0, cargasB7 = 0, residuo = 0, destino = '—', cantApoyo = 0, tiempoCorte = 0, tiempoLogistico = 0;

      if (hasCategory) {
        const l = parseFloat(info.largo) || 0;
        const w = parseFloat(info.ancho) || 0;
        const e = parseFloat(info.esp) || 0;
        const d = parseFloat(info.dens) || 0;
        volume = (l * w * e) / 1000000;
        weight = volume * d;
        alturaTotal = e * qty;
        
        const date = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
        const groupKey = `${cat}-${date}-${info.ancho}-${info.largo}-${info.esp}`;
        groupSum = gTotals.get(groupKey) || 0;
        alturaUtil = isNaN(d) ? 103 : (d < 30 ? 103 : 85);
        
        nCycles = Math.floor(alturaUtil / (e || 1)) + 4;
        nSub = groupSum / (alturaUtil || 1);
        cargasB7 = nSub / 7;
        residuo = nSub % 7;
        
        const minutesStandard = tMap.get(info.code) || 0;
        timeCatalog = (qty * minutesStandard) / 60;
        tiempoCorte = (nCycles * timeCatalog) * (cargasB7 || 1);
        tiempoLogistico = calculateCargaDescargaTime(qty, e, cargasB7);

        if (residuo > 0) {
          if (residuo <= 2) {
            destino = "MÁQ. APOYO";
            cantApoyo = residuo;
          } else {
            destino = "+1 CARGA PPAL.";
          }
        } else if (nSub > 0) {
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
          <td className="px-2 py-3 font-mono font-bold text-purple-900 border-r border-dashed border-gray-100 bg-purple-50/5">{hasCategory ? groupSum.toFixed(2) : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-teal-900 border-r border-dashed border-gray-100 bg-teal-50/10">{hasCategory ? alturaUtil : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold border-r border-dashed border-gray-100 bg-teal-50/5 text-teal-600">{hasCategory ? nCycles : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-orange-700 border-r border-dashed border-gray-100 bg-orange-50/5">{hasCategory ? nSub.toFixed(2) : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-orange-900 border-r border-dashed border-gray-100 bg-orange-50/5">{hasCategory ? cargasB7.toFixed(1) : '—'}</td>
          <td className={cn("px-2 py-3 font-bold border-r border-dashed border-gray-100 text-[8px]", hasCategory && destino.includes('APOYO') ? 'text-blue-600' : 'text-gray-500')}>{hasCategory ? destino : '—'}</td>
          <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100">{hasCategory && cantApoyo > 0 ? cantApoyo.toFixed(2) : '—'}</td>
          <td className="px-3 py-3 font-mono font-bold border-r border-dashed border-gray-100 text-teal-600 bg-teal-50/5">
            {hasCategory && tiempoLogistico > 0 ? tiempoLogistico.toFixed(2) : '—'}
          </td>
          <td className="px-3 py-3 font-mono font-bold border-r border-dashed border-gray-100 text-amber-600 bg-amber-50/5">
            {hasCategory && timeCatalog > 0 ? timeCatalog.toFixed(2) : '—'}
          </td>
          <td className="px-3 py-3 font-mono font-bold border-r border-dashed border-gray-100 text-amber-900 bg-amber-100/30">
            {hasCategory && tiempoCorte > 0 ? tiempoCorte.toFixed(2) : '—'}
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
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-blue-700 bg-blue-50/20">Máq. Apoyo</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-red-700 bg-red-50/20">Carga Extra PPAL</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-teal-700 bg-teal-50/30"><Truck className="w-3 h-3 inline mr-1"/> Carga/Desc. (h)</th>
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-amber-700 bg-amber-50/20">T. Pl Corte</th>
                        <th className="px-4 py-4 text-center text-amber-900 bg-amber-100/20">Tiempo Corte</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[10px]">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={16} className="py-8 text-center text-gray-400 italic">Sin bloques programados</td></tr>
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
                            <td className="px-3 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 bg-blue-50/10">{row.cantApoyo > 0 ? row.cantApoyo.toFixed(2) : '—'}</td>
                            <td className="px-3 py-3 font-mono font-bold text-red-700 border-r border-dashed border-gray-100 bg-red-50/10">{row.cargaExtraPrincipal > 0 ? 'SÍ (1)' : '—'}</td>
                            <td className="px-3 py-3 font-mono font-bold text-teal-600 border-r border-dashed border-gray-100 bg-teal-50/10">{row.tiempoLogistico.toFixed(2)}</td>
                            <td className="px-4 py-3 font-mono font-bold text-amber-700 border-r border-dashed border-gray-100 bg-amber-50/5">{row.totalTimeCatalog.toFixed(2)}</td>
                            <td className="px-4 py-3 font-mono font-bold text-amber-900 text-center bg-amber-100/10">{row.tiempoCorteCalculado.toFixed(2)}</td>
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
            { t: 'Planta 1000 - Quito (Provisionales)', d: provC1000, s: scrollProv1000, b: 'bg-green-600', c: 'text-green-700', gTotals: groupTotals1000, tMap: getTiemposMap(tiemposC1000) }, 
            { t: 'Planta 2000 - Guayaquil (Provisionales)', d: provC2000, s: scrollProv2000, b: 'bg-indigo-600', c: 'text-indigo-700', gTotals: groupTotals2000, tMap: getTiemposMap(tiemposC2000) } 
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
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Categoría</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">DENS.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">ANCHO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">LARGO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">ESP.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Cant.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 text-indigo-900 bg-indigo-50/30">ALTURA TOT.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 text-purple-900 bg-purple-50/20">SUMA ALT. GRP</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 text-teal-900 bg-teal-50/20">ALTURA UTIL</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-teal-50/10 text-teal-700">NRO CICLOS</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10">NRO SUBBL.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10">CARGAS (B7)</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10">RESIDUO / DESTINO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-100 bg-orange-50/10">CANT. APOYO</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-100 text-teal-700 bg-teal-50/30 text-center">Carga/Desc. (h)</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-100 text-amber-700 bg-amber-50/30 text-center">T. Pl Corte</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-100 text-amber-900 bg-amber-100/30 text-center">TIEMPO CORTE</th>
                        <th className="px-3 py-4 text-center">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {renderTableBody(center.d, center.gTotals, center.tMap)}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="grupos" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                        <th className="px-4 py-4 border-r border-dashed border-gray-200 text-center">Línea Prod.</th>
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