'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wind, Users, Lock, Package, Loader2, Clock, CheckCircle2, Settings2 } from 'lucide-react';
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

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Refs para sincronización de scroll
  const scrollProv1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollProv2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

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

  const filterData = (data: any[], centro: string, applyDateFilter: boolean = false) => {
    if (!data || data.length === 0) return [];
    
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
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;

      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = respCodes.length === 0 || respCodes.some(code => itemResp === code || itemResp.includes(code));

      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      const hasAlmField = o.hasOwnProperty('ALMACEN') || o.hasOwnProperty('Almacen') || o.hasOwnProperty('almacen');
      const matchAlm = !hasAlmField || almCodes.length === 0 || itemAlmValue === '' || almCodes.includes(itemAlmValue);

      const itemSectorValue = String(o.SECTORDESC || o.Sector || o.SECTOR || '').trim();
      const hasSectorField = o.hasOwnProperty('SECTORDESC') || o.hasOwnProperty('Sector') || o.hasOwnProperty('SECTOR');
      const matchSector = !hasSectorField || sectorCodes.length === 0 || itemSectorValue === '' || sectorCodes.some(code => itemSectorValue.includes(code));

      return matchResp && matchAlm && matchSector;
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
      const dimMatch = desc.match(/(\d{2,})\s*[xX*]\s*(\d{2,})(?:\s*[xX*]\s*(\d+))?/);
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
    const items = [scrollProv1000, scrollProv2000, scrollTiempos1000, scrollTiempos2000];
    const cleaners = items.map(setupScrollSync);
    const timer = setTimeout(() => {
      items.forEach(s => { if (s.table.current) s.width[1](s.table.current.offsetWidth); });
    }, 500);
    return () => {
      clearTimeout(timer);
      cleaners.forEach(c => c?.());
    };
  }, [activeTab, ordenes, tiemposEnsamblado, mounted]);

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <div className="p-3 bg-primary rounded-2xl shadow-lg animate-pulse">
        <Loader2 className="w-12 h-12 animate-spin text-white" />
      </div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sincronizando Planificación de Espumas...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-8 space-y-6 bg-gray-50/50 min-h-screen">
      <div className="flex items-center space-x-3 pb-2 border-b border-gray-100">
        <Wind className="w-6 h-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tighter">Planificación Táctica Corte Espuma</h2>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-11 bg-muted/30 p-1 rounded-lg">
          <TabsTrigger value="grupos" className="gap-2 text-[10px] font-semibold uppercase"><Users className="w-3 h-3" /> Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="gap-2 text-[10px] font-semibold uppercase"><Lock className="w-3 h-3" /> Filtros</TabsTrigger>
          <TabsTrigger value="ordenes" className="gap-2 text-[10px] font-semibold uppercase"><Package className="w-3 h-3" /> Provisionales</TabsTrigger>
          <TabsTrigger value="tiempos" className="gap-2 text-[10px] font-semibold uppercase"><Clock className="w-3 h-3" /> Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="shadow-sm border-l-2 border-l-primary/50 overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-semibold text-muted-foreground uppercase">Centro {g.centro}</span>
                    <Badge variant="outline" className="text-[8px] h-4 text-green-600 border-green-200 py-0 px-1">Activo</Badge>
                  </div>
                  <h4 className="font-semibold text-gray-800 text-sm">{g.nombre_grupo}</h4>
                  <p className="text-[9px] font-mono text-gray-400 mt-2 tracking-widest">ID: {g.codigo_grupo}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones" className="mt-4">
          <Card className="shadow-sm overflow-hidden border-none rounded-xl bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50/50 text-[9px] font-bold uppercase text-gray-400 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left">Parámetro Técnico</th>
                    <th className="px-4 py-3 text-center">Valor</th>
                    <th className="px-4 py-3 text-left">Descripción Operativa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {restricciones.map(r => (
                    <tr key={r.codigo_restriccion} className="hover:bg-gray-50/30">
                      <td className="px-4 py-3 font-semibold text-gray-600 uppercase tracking-tighter">{r.nombre_restriccion}</td>
                      <td className="px-4 py-3 text-center">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-primary font-medium">{r.valor_restriccion}</code>
                      </td>
                      <td className="px-4 py-3 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="mt-4 space-y-8">
          {[ 
            { t: 'Planta 1000 - Quito (Provisionales)', d: provC1000, s: scrollProv1000, c: 'text-green-700', b: 'bg-green-600', m: getTiemposMap(tiemposC1000) }, 
            { t: 'Planta 2000 - Guayaquil (Provisionales)', d: provC2000, s: scrollProv2000, c: 'text-indigo-700', b: 'bg-indigo-600', m: getTiemposMap(tiemposC2000) } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <h3 className={cn("text-xs font-bold uppercase flex items-center gap-2", center.c)}>
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} /> {center.t} ({center.d.length} órdenes)
                </h3>
              </div>
              <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[450px]">
                  <table ref={center.s.table} className="w-full border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-[8px] font-black uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Orden</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Material</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-left">Descripción</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">DENS.</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">ANCHO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">LARGO</th>
                        <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">ESP.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Cant.</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-teal-700 bg-teal-50/30 text-center">Tiempo PL</th>
                        <th className="px-3 py-4 border-r border-dashed border-gray-200 text-amber-700 bg-amber-50/30 text-center">T. Pl Corte</th>
                        <th className="px-3 py-4 text-center">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[10px]">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={11} className="py-8 text-center text-gray-400 italic">Sin registros</td></tr>
                      ) : (
                        center.d.map((o, i) => {
                          const info = extractMaterialInfo(o);
                          const matchingTimeMin = center.m.get(info.code);
                          const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                          const calculatedHours = matchingTimeMin !== undefined ? (qty * matchingTimeMin) / 60 : null;
                          const calculatedCorteHours = (qty * 5) / 3600;
                          
                          return (
                            <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-3 py-3 font-semibold text-gray-900 border-r border-dashed border-gray-100 text-center">{o.ORDENPREVISIONAL || '—'}</td>
                              <td className="px-3 py-3 font-mono font-semibold text-primary border-r border-dashed border-gray-100 text-center tracking-tighter">{info.code}</td>
                              <td className="px-3 py-3 text-left border-r border-dashed border-gray-100 truncate max-w-[200px] text-gray-500 uppercase">{info.desc}</td>
                              <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 text-center bg-blue-50/5">{info.dens}</td>
                              <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 text-center bg-blue-50/5">{info.ancho}</td>
                              <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 text-center bg-blue-50/5">{info.largo}</td>
                              <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 text-center bg-blue-50/5">{info.esp}</td>
                              <td className="px-3 py-3 font-semibold text-gray-900 border-r border-dashed border-gray-100 text-center font-mono">{qty}</td>
                              <td className="px-3 py-3 font-mono font-bold border-r border-dashed border-gray-100 text-center text-teal-600 bg-teal-50/5">
                                {calculatedHours !== null ? calculatedHours.toFixed(2) : '0.00'}
                              </td>
                              <td className="px-3 py-3 font-mono font-bold border-r border-dashed border-gray-100 text-center text-amber-600 bg-amber-50/5">
                                {calculatedCorteHours.toFixed(2)}
                              </td>
                              <td className="px-3 py-3 font-medium text-gray-400 text-center">{o.Almacen || '—'}</td>
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
        </TabsContent>

        <TabsContent value="tiempos" className="mt-4 space-y-6">
          {[ 
            { t: 'Parámetros Técnicos - Quito', d: tiemposC1000, s: scrollTiempos1000, c: 'text-primary', b: 'bg-primary' }, 
            { t: 'Parámetros Técnicos - Guayaquil', d: tiemposC2000, s: scrollTiempos2000, c: 'text-indigo-600', b: 'bg-indigo-600' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className={cn("w-1.5 h-1.5 rounded-full", center.b)} />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-tight", center.c)}>{center.t}</h3>
                <Badge variant="secondary" className="ml-1 text-[8px] h-3.5 px-1 font-semibold">{center.d.length} PRODUCTOS</Badge>
              </div>
              <Card className="shadow-sm overflow-hidden border-none rounded-xl bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/30 border-b border-gray-100"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[400px]">
                  <table ref={center.s.table} className="w-full border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-center border-r border-dashed border-gray-100">Material</th>
                        <th className="px-4 py-3 text-left border-r border-dashed border-gray-100">Línea Técnica</th>
                        <th className="px-4 py-3 text-center border-r border-dashed border-gray-100">Min. Est.</th>
                        <th className="px-4 py-3 text-center border-r border-dashed border-gray-100">Stock</th>
                        <th className="px-4 py-3 text-center">Seguridad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-[10px] uppercase tracking-widest italic">Sin registros</td></tr>
                      ) : (
                        center.d.map((t, i) => {
                          const info = extractMaterialInfo(t);
                          return (
                            <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-4 py-2.5 font-mono font-semibold text-primary/80 text-center border-r border-dashed border-gray-50 tracking-tighter">{info.code}</td>
                              <td className="px-4 py-2.5 text-left border-r border-dashed border-gray-50">
                                <div className="font-semibold text-gray-600 uppercase leading-none text-[10px]">{t.Linea || '—'}</div>
                                <div className="text-[8px] text-gray-400 mt-0.5 font-mono">{t.PuestoTrabajo || '—'}</div>
                              </td>
                              <td className="px-4 py-2.5 font-mono font-semibold text-blue-600/80 text-center border-r border-dashed border-gray-50">{Number(t.Tiempo_Min || t.Tiempo || 0).toFixed(2)}</td>
                              <td className="px-4 py-2.5 font-mono text-center border-r border-dashed border-gray-50 text-gray-400 font-medium">{t.StockActual || 0}</td>
                              <td className="px-4 py-2.5 font-mono text-center text-gray-300 font-medium">{t.StockSeguridad || 0}</td>
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
        </TabsContent>
      </Tabs>
    </div>
  );
};
