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

/**
 * TacticalPlanVentaExternaSection
 * 
 * Implementa la Segmentación Inteligente para Venta Externa.
 * - ÓRDENES PROVISIONALES y TIEMPOS: Filtro por restricciones (RESP, ALM, SECTOR).
 * - ÓRDENES FERT: Data completa de getOrdenesFert, segmentada por planta, sin filtros técnicos.
 */
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
        g.nombre_grupo && g.nombre_grupo.toLowerCase().includes('venta externa')
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
      // Carga paralela pero capturando errores individuales
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

  // Filtrado para Provisionales y Tiempos
  const getFilterCriteria = (centro: string) => {
    const group = grupos.find(g => String(g.centro) === centro);
    if (!group) return { resp: [], alm: [], sector: [] };
    const groupRest = restricciones.filter(r => r.codigo_grupo === group.codigo_grupo);
    return {
      resp: groupRest.filter(r => r.nombre_restriccion === 'RESPCTRLPROD').flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim())).filter(v => v !== ''),
      alm: groupRest.filter(r => r.nombre_restriccion === 'ALMACEN').map(r => r.valor_restriccion.trim()).filter(v => v !== ''),
      sector: groupRest.filter(r => r.nombre_restriccion === 'SECTOR').flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim())).filter(v => v !== '')
    };
  };

  const filterWithCriteria = (data: any[], centro: string, criteria: any) => {
    if (!data || data.length === 0) return [];
    if (criteria.resp.length === 0 && criteria.alm.length === 0 && criteria.sector.length === 0) return [];

    return data.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;
      
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = criteria.resp.length === 0 || criteria.resp.some((code: string) => itemResp.includes(code));
      
      const itemAlm = String(o.Almacen || o.ALMACEN || o.Almacen || '').trim();
      const matchAlm = criteria.alm.length === 0 || itemAlm === '' || criteria.alm.includes(itemAlm);
      
      const itemSector = String(o.Sector || o.SECTOR || '').trim();
      const matchSector = criteria.sector.length === 0 || itemSector === '' || criteria.sector.includes(itemSector);

      return matchResp && matchAlm && matchSector;
    });
  };

  // Segmentación para Provisionales y Tiempos (CON Filtros)
  const crit1000 = useMemo(() => getFilterCriteria('1000'), [grupos, restricciones]);
  const crit2000 = useMemo(() => getFilterCriteria('2000'), [grupos, restricciones]);

  const provC1000 = useMemo(() => filterWithCriteria(ordenes, '1000', crit1000), [ordenes, crit1000]);
  const provC2000 = useMemo(() => filterWithCriteria(ordenes, '2000', crit2000), [ordenes, crit2000]);
  const tiemposC1000 = useMemo(() => filterWithCriteria(tiemposEnsamblado, '1000', crit1000), [tiemposEnsamblado, crit1000]);
  const tiemposC2000 = useMemo(() => filterWithCriteria(tiemposEnsamblado, '2000', crit2000), [tiemposEnsamblado, crit2000]);

  // Segmentación para Órdenes FERT (SIN Filtros, solo por planta)
  const fertC1000 = useMemo(() => ordenesFert.filter(o => String(o.Centro || o.CENTRO || '').trim() === '1000'), [ordenesFert]);
  const fertC2000 = useMemo(() => ordenesFert.filter(o => String(o.Centro || o.CENTRO || '').trim() === '2000'), [ordenesFert]);

  // Auxiliar para separar material y descripción
  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const match = matStr.match(/^(\d+)\s+(.*)$/);
    if (match) return { code: match[1].slice(-8), desc: match[2].trim() };
    if (/^\d+$/.test(matStr)) return { code: matStr.slice(-8), desc: item.NOMBRE || item.NombreMaterial || item.Descripcion || '—' };
    return { code: '—', desc: matStr || '—' };
  };

  // Scroll Sync
  const setupScroll = (group: any) => {
    if (!group.top.current || !group.bottom.current) return;
    const syncB = () => { if (group.bottom.current) group.bottom.current.scrollLeft = group.top.current.scrollLeft; };
    const syncT = () => { if (group.top.current) group.top.current.scrollLeft = group.bottom.current.scrollLeft; };
    group.top.current.addEventListener('scroll', syncB);
    group.bottom.current.addEventListener('scroll', syncT);
    return () => { group.top.current?.removeEventListener('scroll', syncB); group.bottom.current?.removeEventListener('scroll', syncT); };
  };

  useEffect(() => {
    if (!mounted) return;
    const items = [scrollProv1000, scrollProv2000, scrollFert1000, scrollFert2000, scrollTiempos1000, scrollTiempos2000];
    const cleaners = items.map(setupScroll);
    setTimeout(() => items.forEach(s => { if (s.table.current) s.width[1](s.table.current.offsetWidth); }), 400);
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
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="restricciones">Restricciones</TabsTrigger>
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

        <TabsContent value="restricciones">
          <Card className="overflow-hidden border rounded-xl">
            <table className="w-full text-center">
              <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-400">
                <tr><th className="py-4 border-r">Parámetro</th><th className="py-4 border-r">Valor</th><th className="py-4">Descripción</th></tr>
              </thead>
              <tbody className="divide-y text-xs">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion}>
                    <td className="py-4 font-bold border-r">{r.nombre_restriccion}</td>
                    <td className="py-4 border-r"><Badge variant="outline">{r.valor_restriccion}</Badge></td>
                    <td className="py-4 text-gray-400 italic">{r.descripcion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-8">
          {[ { title: 'Quito - 1000', data: provC1000, scroll: scrollProv1000 }, { title: 'Guayaquil - 2000', data: provC2000, scroll: scrollProv2000 } ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="text-sm font-bold uppercase text-green-700 px-2">{center.title} ({center.data.length})</h3>
              <Card className="overflow-hidden border rounded-xl shadow-sm">
                <div ref={center.scroll.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: center.scroll.width[0], height: '1px' }} /></div>
                <div ref={center.scroll.bottom} className="overflow-x-auto border-t max-h-[400px]">
                  <table ref={center.scroll.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-50 sticky top-0 text-[10px] font-bold text-gray-500 uppercase">
                      <tr><th className="px-4 py-3 border-r">Orden</th><th className="px-4 py-3 border-r">Material</th><th className="px-4 py-3 border-r">Descripción</th><th className="px-4 py-3 border-r">Cantidad</th><th>Almacén</th></tr>
                    </thead>
                    <tbody className="divide-y text-[11px]">
                      {center.data.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        return (
                          <tr key={i} className="hover:bg-green-50/30">
                            <td className="px-4 py-3 border-r font-medium">{o.ORDENPREVISIONAL}</td>
                            <td className="px-4 py-3 border-r font-mono text-green-600 font-bold">{info.code}</td>
                            <td className="px-4 py-3 border-r text-left truncate max-w-[250px] uppercase font-bold text-gray-500">{info.desc}</td>
                            <td className="px-4 py-3 border-r font-bold">{o.CANTIDAD}</td>
                            <td className="px-4 py-3 font-medium text-gray-400">{o.Almacen}</td>
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
              <h3 className="text-sm font-bold uppercase text-blue-700 px-2">{center.title} ({center.data.length})</h3>
              <Card className="overflow-hidden border rounded-xl shadow-sm">
                <div ref={center.scroll.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: center.scroll.width[0], height: '1px' }} /></div>
                <div ref={center.scroll.bottom} className="overflow-x-auto border-t max-h-[400px]">
                  <table ref={center.scroll.table} className="w-full border-collapse">
                    <thead className="bg-gray-50 sticky top-0 text-[10px] font-bold text-gray-500 uppercase">
                      <tr><th className="px-4 py-3 border-r">Orden FERT</th><th className="px-4 py-3 border-r">Material (Crudo)</th><th className="px-4 py-3 border-r">Cantidad</th><th>Almacén</th></tr>
                    </thead>
                    <tbody className="divide-y text-[11px]">
                      {center.data.map((o, i) => (
                        <tr key={i} className="hover:bg-blue-50/30">
                          <td className="px-4 py-3 border-r text-center font-medium">{o.ORDENFERT || o.ORDENPREVISIONAL}</td>
                          <td className="px-4 py-3 border-r text-left font-bold text-gray-600">{o.MATERIAL || o.Material || o.CodMaterial}</td>
                          <td className="px-4 py-3 border-r text-center font-bold">{o.CANTIDAD}</td>
                          <td className="px-4 py-3 text-center text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="tiempos" className="space-y-8">
          {[ { title: 'Catálogo Quito', data: tiemposC1000, scroll: scrollTiempos1000 }, { title: 'Catálogo Guayaquil', data: tiemposC2000, scroll: scrollTiempos2000 } ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="text-sm font-bold uppercase text-indigo-700 px-2">{center.title} ({center.data.length})</h3>
              <Card className="overflow-hidden border rounded-xl shadow-sm">
                <div ref={center.scroll.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: center.scroll.width[0], height: '1px' }} /></div>
                <div ref={center.scroll.bottom} className="overflow-x-auto border-t max-h-[400px]">
                  <table ref={center.scroll.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-50 sticky top-0 text-[10px] font-bold text-gray-500 uppercase">
                      <tr><th className="px-4 py-3 border-r">Material</th><th className="px-4 py-3 border-r">Descripción</th><th className="px-4 py-3 border-r">Línea Técnica</th><th className="px-4 py-3 border-r">T. Estándar</th><th>Stock/Seg.</th></tr>
                    </thead>
                    <tbody className="divide-y text-[11px]">
                      {center.data.map((t, i) => {
                        const info = extractMaterialInfo(t);
                        return (
                          <tr key={i} className="hover:bg-indigo-50/30">
                            <td className="px-4 py-3 border-r font-mono font-bold">{info.code}</td>
                            <td className="px-4 py-3 border-r text-left uppercase font-bold text-gray-500 truncate max-w-[200px]">{info.desc}</td>
                            <td className="px-4 py-3 border-r font-medium text-gray-700">{t.Linea}</td>
                            <td className="px-4 py-3 border-r font-bold text-indigo-600">{t.Tiempo_Min?.toFixed(4)}</td>
                            <td className="px-4 py-3 text-gray-400 font-medium">{t.StockActual || 0} / {t.StockSeguridad || 0}</td>
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
