'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';

export const TacticalPlanVentaExternaSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanVentaExterna');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Refs para sincronización de scroll
  const scrollProv1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollProv2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollFert1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollFert2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

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
      const matchAlm = almCodes.length === 0 || itemAlmValue === '' || almCodes.includes(itemAlmValue);
      
      const itemSectorValue = String(o.SECTORDESC || o.Sector || o.SECTOR || '').trim();
      const matchSector = sectorCodes.length === 0 || itemSectorValue === '' || sectorCodes.some(code => itemSectorValue.includes(code));

      return matchResp && matchAlm && matchSector;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restricciones]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restricciones]);
  const fertC1000 = useMemo(() => filterData(ordenesFert, '1000'), [ordenesFert, grupos, restricciones]);
  const fertC2000 = useMemo(() => filterData(ordenesFert, '2000'), [ordenesFert, grupos, restricciones]);
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
    const items = [scrollProv1000, scrollProv2000, scrollFert1000, scrollFert2000, scrollTiempos1000, scrollTiempos2000];
    const cleaners = items.map(setupScroll);
    setTimeout(() => items.forEach(s => { if (s.table.current) s.width[1](s.table.current.offsetWidth); }), 500);
    return () => cleaners.forEach(c => c?.());
  }, [activeTab, ordenes, ordenesFert, tiemposEnsamblado, mounted]);

  if (!mounted || isLoading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-green-600" /></div>;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-4 mb-4">
        <ShoppingCart className="w-8 h-8 text-green-600" />
        <h2 className="text-2xl font-bold text-gray-800 uppercase">Planificación Táctica Venta Externa</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="grupos">GRUPOS</TabsTrigger>
          <TabsTrigger value="ordenes">ÓRDENES PROVISIONALES</TabsTrigger>
          <TabsTrigger value="ordenesFert">ÓRDENES FERT</TabsTrigger>
          <TabsTrigger value="tiempos">TIEMPOS ENSAMBLADO</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="p-6 border-2 border-dashed">
                <Badge className="bg-green-600 mb-2">Centro {g.centro}</Badge>
                <h4 className="font-bold uppercase">{g.nombre_grupo}</h4>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-8">
          {[ { title: 'Quito - 1000', data: provC1000, scroll: scrollProv1000 }, { title: 'Guayaquil - 2000', data: provC2000, scroll: scrollProv2000 } ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="text-sm font-bold uppercase text-green-700 px-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" /> {center.title} ({center.data.length})
              </h3>
              <Card className="overflow-hidden border border-dashed rounded-xl shadow-sm">
                <div ref={center.scroll.top} className="overflow-x-auto h-3 bg-gray-50 border-b border-gray-100"><div style={{ width: center.scroll.width[0], height: '1px' }} /></div>
                <div ref={center.scroll.bottom} className="overflow-x-auto max-h-[400px]">
                  <table ref={center.scroll.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-50 sticky top-0 text-[10px] font-bold text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200 text-left">Descripción</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Cantidad</th>
                        <th className="px-4 py-3">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dashed border-gray-100 text-[11px]">
                      {center.data.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        return (
                          <tr key={i} className="hover:bg-green-50/30 transition-colors">
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 font-medium text-gray-900">{o.ORDENPREVISIONAL || '—'}</td>
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 font-mono text-green-600 font-bold text-center">{info.code}</td>
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 text-left truncate max-w-[250px] uppercase font-bold text-gray-500">{info.desc}</td>
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 font-black text-gray-900 text-center">{o.CANTIDAD || '—'}</td>
                            <td className="px-4 py-3 font-medium text-gray-400 text-center">{o.Almacen || '—'}</td>
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
          {[ { title: 'Quito - 1000', data: fertC1000, scroll: scrollFert1000 }, { title: 'Guayaquil - 2000', data: fertC2000, scroll: scrollFert2000 } ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="text-sm font-bold uppercase text-blue-700 px-2 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-blue-500" /> {center.title} ({center.data.length})
              </h3>
              <Card className="overflow-hidden border border-dashed rounded-xl shadow-sm">
                <div ref={center.scroll.top} className="overflow-x-auto h-3 bg-gray-50 border-b border-gray-100"><div style={{ width: center.scroll.width[0], height: '1px' }} /></div>
                <div ref={center.scroll.bottom} className="overflow-x-auto max-h-[400px]">
                  <table ref={center.scroll.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-50 sticky top-0 text-[10px] font-bold text-gray-500 uppercase">
                      <tr>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Orden</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Material</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200 text-left">Descripción</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Sector</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Categoría</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Cant. Prog.</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Entregada</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Notificada</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Rechazo</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Pendiente</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">T. Pend (min)</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Fecha</th>
                        <th className="px-3 py-3 border-r border-dashed border-gray-200">Resp.</th>
                        <th className="px-3 py-3">Máquina</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dashed border-gray-100 text-[10px]">
                      {center.data.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        return (
                          <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 font-bold text-gray-900 text-center">{o.ORDEN || '—'}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-blue-600 font-black text-center">{info.code}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 text-left truncate max-w-[200px] uppercase font-bold text-gray-500">{info.desc}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 text-center">{o.SECTORDESC || '—'}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 text-center font-bold text-gray-400">{o.CATEGORIA || '—'}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 font-black text-gray-800 text-center">{o.CANTPROGRAMADA || 0}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 font-black text-green-700 text-center">{o.CANTENTREGADA || 0}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 font-black text-blue-700 text-center">{o.CANTNOTIFICADA || 0}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 font-black text-red-600 text-center">{o.CANTRECHAZO || 0}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 font-black text-orange-600 text-center">{o.CANTPENDIENTE || 0}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-center">{o.TIEMPOPENDIENTE || 0}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 font-bold text-gray-700 text-center">{o.FECHA || '—'}</td>
                            <td className="px-3 py-3 border-r border-dashed border-gray-100 font-black text-gray-400 uppercase text-center">{o.RESPCTRLPROD || '—'}</td>
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
          {[ { title: 'Quito - 1000', data: tiemposC1000, scroll: scrollTiempos1000 }, { title: 'Guayaquil - 2000', data: tiemposC2000, scroll: scrollTiempos2000 } ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="text-sm font-bold uppercase text-indigo-700 px-2 flex items-center gap-2">
                 <Clock className="w-4 h-4" /> {center.title} ({center.data.length})
              </h3>
              <Card className="overflow-hidden border border-dashed rounded-xl shadow-sm">
                <div ref={center.scroll.top} className="overflow-x-auto h-3 bg-gray-50 border-b border-gray-100"><div style={{ width: center.scroll.width[0], height: '1px' }} /></div>
                <div ref={center.scroll.bottom} className="overflow-x-auto max-h-[400px]">
                  <table ref={center.scroll.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-50 sticky top-0 text-[10px] font-bold text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200 text-left">Descripción</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Línea Técnica</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">T. Estándar</th>
                        <th className="px-4 py-3">Stock / Seg.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dashed border-gray-100 text-[11px]">
                      {center.data.map((t, i) => {
                        const info = extractMaterialInfo(t);
                        return (
                          <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 font-mono font-bold text-indigo-900 text-center">{info.code}</td>
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 text-left uppercase font-bold text-gray-500 truncate max-w-[250px]">{info.desc}</td>
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 font-medium text-gray-700 text-center">{t.Linea || '—'}</td>
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 font-black text-indigo-600 text-center">{t.Tiempo_Min?.toFixed(4) || '—'}</td>
                            <td className="px-4 py-3 text-gray-400 font-medium text-center">{t.StockActual || 0} / {t.StockSeguridad || 0}</td>
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
