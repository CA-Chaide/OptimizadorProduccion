'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wind, Users, Lock, Package, Loader2, Clock, CheckCircle2 } from 'lucide-react';
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

  const filterData = (data: any[], centro: string) => {
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
    const match = matStr.match(/^(\d+)\s+(.*)$/);
    if (match) return { code: match[1].slice(-8), desc: match[2].trim() };
    if (/^\d+$/.test(matStr)) return { code: matStr.slice(-8), desc: nameStr || '—' };
    return { code: '—', desc: matStr || nameStr || '—' };
  };

  const setupScroll = (group: any) => {
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
    const cleaners = items.map(setupScroll);
    setTimeout(() => items.forEach(s => { if (s.table.current) s.width[1](s.table.current.offsetWidth); }), 500);
    return () => cleaners.forEach(c => c?.());
  }, [activeTab, ordenes, tiemposEnsamblado, mounted]);

  if (!mounted || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Cargando Planificación de Espumas...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center space-x-3 pb-2 border-b">
        <Wind className="w-6 h-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tighter">Planificación Táctica Corte Espuma</h2>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12 bg-muted/50 p-1 rounded-lg">
          <TabsTrigger value="grupos" className="gap-2 text-[10px] font-bold uppercase"><Users className="w-3 h-3" /> Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="gap-2 text-[10px] font-bold uppercase"><Lock className="w-3 h-3" /> Filtros</TabsTrigger>
          <TabsTrigger value="ordenes" className="gap-2 text-[10px] font-bold uppercase"><Package className="w-3 h-3" /> Provisionales</TabsTrigger>
          <TabsTrigger value="tiempos" className="gap-2 text-[10px] font-bold uppercase"><Clock className="w-3 h-3" /> Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="shadow-sm border-l-4 border-l-primary overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">Centro {g.centro}</span>
                    <Badge variant="outline" className="text-[8px] text-green-600 border-green-200">Activo</Badge>
                  </div>
                  <h4 className="font-bold text-gray-800 text-sm">{g.nombre_grupo}</h4>
                  <p className="text-[9px] font-mono text-gray-400 mt-2 tracking-widest">ID: {g.codigo_grupo}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones" className="mt-4">
          <Card className="shadow-sm overflow-hidden border-none rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[9px] font-bold uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">Parámetro Técnico</th>
                    <th className="px-4 py-3 text-center">Valor</th>
                    <th className="px-4 py-3 text-left">Descripción Operativa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {restricciones.map(r => (
                    <tr key={r.codigo_restriccion} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-bold text-gray-700 uppercase tracking-tighter">{r.nombre_restriccion}</td>
                      <td className="px-4 py-3 text-center">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-primary font-bold">{r.valor_restriccion}</code>
                      </td>
                      <td className="px-4 py-3 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ÓRDENES PROVISIONALES */}
        <TabsContent value="ordenes" className="mt-4 space-y-6">
          {[ 
            { t: 'Planta 1000 (Quito)', d: provC1000, s: scrollProv1000, c: 'text-primary', b: 'bg-primary' }, 
            { t: 'Planta 2000 (Guayaquil)', d: provC2000, s: scrollProv2000, c: 'text-indigo-600', b: 'bg-indigo-600' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} />
                <h3 className={cn("text-[10px] font-bold uppercase", center.c)}>{center.t}</h3>
                <Badge variant="secondary" className="ml-2 text-[8px] h-4 font-bold">{center.d.length} ÓRDENES</Badge>
              </div>
              <Card className="shadow-sm overflow-hidden border-none rounded-2xl bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[400px]">
                  <table ref={center.s.table} className="w-full border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10 text-[9px] font-bold uppercase text-muted-foreground border-b">
                      <tr>
                        <th className="px-4 py-4 text-center border-r border-dashed border-gray-100">Orden</th>
                        <th className="px-4 py-4 text-center border-r border-dashed border-gray-100">Material</th>
                        <th className="px-4 py-4 text-left border-r border-dashed border-gray-100">Descripción</th>
                        <th className="px-4 py-4 text-center border-r border-dashed border-gray-100">Cant.</th>
                        <th className="px-4 py-4 text-center">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-[10px] font-bold uppercase tracking-widest italic">Sin registros de demanda</td></tr>
                      ) : (
                        center.d.map((o, i) => {
                          const info = extractMaterialInfo(o);
                          return (
                            <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-4 py-2.5 font-bold text-gray-900 text-center border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL || '—'}</td>
                              <td className="px-4 py-2.5 font-mono font-bold text-primary text-center border-r border-dashed border-gray-100 tracking-tighter">{info.code}</td>
                              <td className="px-4 py-2.5 text-left border-r border-dashed border-gray-100 truncate max-w-[250px] font-medium text-gray-500 uppercase">{info.desc}</td>
                              <td className="px-4 py-2.5 font-mono font-bold text-gray-900 text-center border-r border-dashed border-gray-100 text-sm">{o.CANTIDAD || '0'}</td>
                              <td className="px-4 py-2.5 text-gray-400 text-center font-bold">{o.Almacen || '—'}</td>
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

        {/* CATÁLOGO DE TIEMPOS */}
        <TabsContent value="tiempos" className="mt-4 space-y-6">
          {[ 
            { t: 'Parámetros Técnicos - Quito', d: tiemposC1000, s: scrollTiempos1000, c: 'text-primary', b: 'bg-primary' }, 
            { t: 'Parámetros Técnicos - Guayaquil', d: tiemposC2000, s: scrollTiempos2000, c: 'text-indigo-600', b: 'bg-indigo-600' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className={cn("w-2 h-2 rounded-full animate-pulse", center.b)} />
                <h3 className={cn("text-[10px] font-bold uppercase", center.c)}>{center.t}</h3>
                <Badge variant="secondary" className="ml-2 text-[8px] h-4 font-bold">{center.d.length} PRODUCTOS</Badge>
              </div>
              <Card className="shadow-sm overflow-hidden border-none rounded-2xl bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-3 bg-gray-50/50 border-b"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[400px]">
                  <table ref={center.s.table} className="w-full border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10 text-[9px] font-bold uppercase text-muted-foreground border-b">
                      <tr>
                        <th className="px-4 py-4 text-center border-r border-dashed border-gray-100">Material</th>
                        <th className="px-4 py-4 text-left border-r border-dashed border-gray-100">Línea Técnica</th>
                        <th className="px-4 py-4 text-center border-r border-dashed border-gray-100">Min. Est.</th>
                        <th className="px-4 py-4 text-center border-r border-dashed border-gray-100">Stock</th>
                        <th className="px-4 py-4 text-center">Seguridad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-[10px] font-bold uppercase tracking-widest italic">Sin datos técnicos cargados</td></tr>
                      ) : (
                        center.d.map((t, i) => {
                          const info = extractMaterialInfo(t);
                          return (
                            <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-4 py-2.5 font-mono font-bold text-primary text-center border-r border-dashed border-gray-100 tracking-tighter">{info.code}</td>
                              <td className="px-4 py-2.5 text-left border-r border-dashed border-gray-100">
                                <div className="font-bold text-gray-700 uppercase leading-none text-[11px]">{t.Linea || '—'}</div>
                                <div className="text-[8px] text-gray-400 mt-1 font-mono">{t.PuestoTrabajo || '—'}</div>
                              </td>
                              <td className="px-4 py-2.5 font-mono font-bold text-blue-600 text-center border-r border-dashed border-gray-100">{t.Tiempo_Min?.toFixed(2) || '—'}</td>
                              <td className="px-4 py-2.5 font-mono text-center border-r border-dashed border-gray-100 text-gray-500 font-bold">{t.StockActual || 0}</td>
                              <td className="px-4 py-2.5 font-mono text-center text-gray-400 font-bold">{t.StockSeguridad || 0}</td>
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
