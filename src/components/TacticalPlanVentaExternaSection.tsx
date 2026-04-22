'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, Clock, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const TacticalPlanVentaExternaSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanVentaExterna');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estados de búsqueda interna por tab
  const [searchProv1000, setSearchProv1000] = useState('');
  const [searchProv2000, setSearchProv2000] = useState('');
  const [searchFert, setSearchFert] = useState('');
  const [searchTiempos, setSearchTiempos] = useState('');

  // Refs para sincronización de scroll
  const scrollRefs = {
    c1000: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: 0 },
    c2000: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: 0 },
    fert: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: 0 },
    tiempos: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: 0 }
  };

  const [, forceUpdate] = useState({});

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
      const [provRes, fertRes] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getOrdenesFert(1, 20000)
      ]);
      
      setOrders(provRes.data || []);
      setOrdersFert(fertRes.data || []);

      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
        if (res.data && Array.isArray(res.data)) {
          allTiempos.push(...res.data);
        }
      }
      setTiemposEnsamblado(allTiempos);
    } catch (error) {
      console.error('Error cargando datos operativos:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGrupos();
      const ids = filteredGroups.map(g => g.codigo_grupo);
      await fetchRestricciones(ids);
      await loadData(filteredGroups);
      setIsLoading(false);
    };
    init();
  }, []);

  // Lógica de filtrado segmentada por centro
  const getFilteredOrders = (centro: string, query: string) => {
    const group = grupos.find(g => String(g.centro) === centro);
    const groupRest = group ? restricciones.filter(r => r.codigo_grupo === group.codigo_grupo) : [];
    
    const respCodes = groupRest
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almCodes = groupRest
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .map(r => r.valor_restriccion.trim())
      .filter(v => v !== '');

    return ordenes.filter(o => {
      const itemResp = String(o.RESPCTRLPROD || o.RespCtrlProd || '').trim();
      const itemAlm = String(o.Almacen || o.ALMACEN || '').trim();
      const itemCentro = String(o.Centro || o.CENTRO || '').trim();
      
      // Si el item no pertenece al centro, fuera
      if (itemCentro !== centro) return false;

      // Aplicar restricciones técnicas si existen
      const matchResp = respCodes.length === 0 || respCodes.includes(itemResp);
      const matchAlm = almCodes.length === 0 || almCodes.includes(itemAlm);
      
      // Aplicar búsqueda de usuario
      const content = JSON.stringify(o).toLowerCase();
      const matchQuery = !query || content.includes(query.toLowerCase());

      return matchResp && matchAlm && matchQuery;
    });
  };

  const ordenesC1000 = useMemo(() => getFilteredOrders('1000', searchProv1000), [ordenes, grupos, restricciones, searchProv1000]);
  const ordenesC2000 = useMemo(() => getFilteredOrders('2000', searchProv2000), [ordenes, grupos, restricciones, searchProv2000]);

  const fertFiltradas = useMemo(() => {
    const allResps = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()));

    return ordenesFert.filter(o => {
      const itemResp = String(o.RESPCTRLPROD || o.RespCtrlProd || '').trim();
      const matchRest = allResps.length === 0 || allResps.includes(itemResp);
      const matchQuery = !searchFert || JSON.stringify(o).toLowerCase().includes(searchFert.toLowerCase());
      return matchRest && matchQuery;
    });
  }, [ordenesFert, restricciones, searchFert]);

  const tiemposFiltrados = useMemo(() => {
    return tiemposEnsamblado.filter(t => {
      const content = JSON.stringify(t).toLowerCase();
      return !searchTiempos || content.includes(searchTiempos.toLowerCase());
    });
  }, [tiemposEnsamblado, searchTiempos]);

  // Sincronización de scroll
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
    const cleaners = [
      setupScroll(scrollRefs.c1000),
      setupScroll(scrollRefs.c2000),
      setupScroll(scrollRefs.fert),
      setupScroll(scrollRefs.tiempos)
    ];
    
    // Actualizar anchos de tabla para el scroll superior
    const updateWidths = () => {
      if (scrollRefs.c1000.table.current) scrollRefs.c1000.width = scrollRefs.c1000.table.current.offsetWidth;
      if (scrollRefs.c2000.table.current) scrollRefs.c2000.width = scrollRefs.c2000.table.current.offsetWidth;
      if (scrollRefs.fert.table.current) scrollRefs.fert.width = scrollRefs.fert.table.current.offsetWidth;
      if (scrollRefs.tiempos.table.current) scrollRefs.tiempos.width = scrollRefs.tiempos.table.current.offsetWidth;
      forceUpdate({});
    };
    
    setTimeout(updateWidths, 100);
    return () => cleaners.forEach(c => c?.());
  }, [activeTab, ordenesC1000, ordenesC2000, fertFiltradas, tiemposFiltrados]);

  if (isLoading) return <div className="flex flex-col items-center justify-center h-screen gap-4"><Loader2 className="w-12 h-12 animate-spin text-green-600" /><p className="text-gray-500 font-medium">Sincronizando Catálogo de Venta Externa...</p></div>;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-4 mb-2">
        <div className="bg-green-600 p-3 rounded-2xl shadow-lg shadow-green-100">
          <ShoppingCart className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight">Planificación Táctica Venta Externa</h2>
          <p className="text-sm text-gray-500">Segmentación por Planta y Catálogo Técnico</p>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-12 bg-gray-100/50 border rounded-xl p-1">
          <TabsTrigger value="grupos" className="rounded-lg font-bold uppercase text-[11px]">Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="rounded-lg font-bold uppercase text-[11px]">Restricciones</TabsTrigger>
          <TabsTrigger value="ordenes" className="rounded-lg font-bold uppercase text-[11px]">Provisionales</TabsTrigger>
          <TabsTrigger value="ordenesFert" className="rounded-lg font-bold uppercase text-[11px]">Órdenes Fert</TabsTrigger>
          <TabsTrigger value="tiempos" className="rounded-lg font-bold uppercase text-[11px]">Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="p-6 border-2 border-dashed rounded-3xl bg-gray-50/50 hover:bg-white transition-colors">
                <Badge className="bg-green-600 mb-3 px-3">Centro {g.centro}</Badge>
                <h4 className="font-black text-gray-800 uppercase text-lg">{g.nombre_grupo}</h4>
                <p className="text-xs text-gray-400 mt-2 font-mono">ID GRUPO: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones" className="mt-6">
          <Card className="rounded-2xl overflow-hidden border-none shadow-sm">
            <div className="overflow-x-auto border rounded-2xl">
              <table className="w-full text-center border-collapse">
                <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400">
                  <tr>
                    <th className="px-6 py-4 border-r border-dashed border-gray-200">Parámetro</th>
                    <th className="px-6 py-4 border-r border-dashed border-gray-200">Valor</th>
                    <th className="px-6 py-4">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {restricciones.map(r => (
                    <tr key={r.codigo_restriccion} className="hover:bg-green-50/20 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-200">{r.nombre_restriccion}</td>
                      <td className="px-6 py-4 border-r border-dashed border-gray-200">
                        <Badge variant="outline" className="font-mono text-green-700 border-green-200 bg-green-50/30">{r.valor_restriccion}</Badge>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400 italic">{r.descripcion || 'Sin descripción técnica'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="mt-6 space-y-8">
          {/* SECCIÓN QUITO C1000 */}
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-gray-50/50 flex flex-row items-center justify-between border-b border-dashed">
              <CardTitle className="text-sm font-black uppercase text-gray-700">Centro 1000 - Quito</CardTitle>
              <Badge className="bg-green-600">{ordenesC1000.length}</Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <Input 
                placeholder="Filtrar órdenes Quito..." 
                value={searchProv1000} 
                onChange={e => setSearchProv1000(e.target.value)}
                className="max-w-xs h-9 text-xs"
              />
              <div className="space-y-0">
                <div ref={scrollRefs.c1000.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-xl"><div style={{ width: scrollRefs.c1000.width, height: '1px' }} /></div>
                <div ref={scrollRefs.c1000.bottom} className="overflow-x-auto border rounded-b-xl max-h-[400px]">
                  <table ref={scrollRefs.c1000.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-black text-gray-500 z-10">
                      <tr>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Descripción</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Cant.</th>
                        <th className="px-4 py-3">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[11px]">
                      {ordenesC1000.map((o, i) => (
                        <tr key={i} className="hover:bg-green-50/30 transition-colors">
                          <td className="px-4 py-3 font-bold border-r border-dashed border-gray-200">{o.ORDENPREVISIONAL}</td>
                          <td className="px-4 py-3 font-mono text-green-600 font-bold border-r border-dashed border-gray-200">{o.MATERIAL}</td>
                          <td className="px-4 py-3 border-r border-dashed border-gray-200 text-left max-w-xs truncate">{o.NOMBRE}</td>
                          <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-200">{o.CANTIDAD}</td>
                          <td className="px-4 py-3 font-bold text-gray-400">{o.Almacen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SECCIÓN GUAYAQUIL C2000 */}
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-gray-50/50 flex flex-row items-center justify-between border-b border-dashed">
              <CardTitle className="text-sm font-black uppercase text-gray-700">Centro 2000 - Guayaquil</CardTitle>
              <Badge className="bg-blue-600">{ordenesC2000.length}</Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <Input 
                placeholder="Filtrar órdenes Guayaquil..." 
                value={searchProv2000} 
                onChange={e => setSearchProv2000(e.target.value)}
                className="max-w-xs h-9 text-xs"
              />
              <div className="space-y-0">
                <div ref={scrollRefs.c2000.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-xl"><div style={{ width: scrollRefs.c2000.width, height: '1px' }} /></div>
                <div ref={scrollRefs.c2000.bottom} className="overflow-x-auto border rounded-b-xl max-h-[400px]">
                  <table ref={scrollRefs.c2000.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-black text-gray-500 z-10">
                      <tr>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Descripción</th>
                        <th className="px-4 py-3 border-r border-dashed border-gray-200">Cant.</th>
                        <th className="px-4 py-3">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[11px]">
                      {ordenesC2000.map((o, i) => (
                        <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-3 font-bold border-r border-dashed border-gray-200">{o.ORDENPREVISIONAL}</td>
                          <td className="px-4 py-3 font-mono text-blue-600 font-bold border-r border-dashed border-gray-200">{o.MATERIAL}</td>
                          <td className="px-4 py-3 border-r border-dashed border-gray-200 text-left max-w-xs truncate">{o.NOMBRE}</td>
                          <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-200">{o.CANTIDAD}</td>
                          <td className="px-4 py-3 font-bold text-gray-400">{o.Almacen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenesFert" className="mt-6">
          <Card className="rounded-2xl border-none shadow-sm p-4">
            <div className="flex justify-between items-center mb-4">
              <Input 
                placeholder="Buscar en Órdenes Fert..." 
                value={searchFert} 
                onChange={e => setSearchFert(e.target.value)}
                className="max-w-xs h-9 text-xs"
              />
              <Badge className="bg-indigo-600">Total Fert: {fertFiltradas.length}</Badge>
            </div>
            <div className="space-y-0">
              <div ref={scrollRefs.fert.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-xl"><div style={{ width: scrollRefs.fert.width, height: '1px' }} /></div>
              <div ref={scrollRefs.fert.bottom} className="overflow-x-auto border rounded-b-xl max-h-[500px]">
                <table ref={scrollRefs.fert.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-black text-gray-500 z-10">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden Fert</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Descripción</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Unidades</th>
                      <th className="px-4 py-3">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px]">
                    {fertFiltradas.map((o, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-200">{o.Orden || o.ORDENFERT}</td>
                        <td className="px-4 py-3 font-mono text-indigo-600 font-bold border-r border-dashed border-gray-200">{o.CodMaterial || o.MATERIAL}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-200 text-left max-w-xs truncate">{o.Descripcion || o.NOMBRE}</td>
                        <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-200">{o.Cantidad || o.CANTIDAD}</td>
                        <td className="px-4 py-3 font-bold text-gray-400">{o.NombRespControlProd || o.RespCtrlProd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos" className="mt-6">
          <Card className="rounded-2xl border-none shadow-sm p-4">
            <div className="flex justify-between items-center mb-4">
              <Input 
                placeholder="Filtrar catálogo técnico..." 
                value={searchTiempos} 
                onChange={e => setSearchTiempos(e.target.value)}
                className="max-w-xs h-9 text-xs"
              />
              <Badge className="bg-purple-600">Catálogo: {tiemposFiltrados.length}</Badge>
            </div>
            <div className="space-y-0">
              <div ref={scrollRefs.tiempos.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-xl"><div style={{ width: scrollRefs.tiempos.width, height: '1px' }} /></div>
              <div ref={scrollRefs.tiempos.bottom} className="overflow-x-auto border rounded-b-xl max-h-[500px]">
                <table ref={scrollRefs.tiempos.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-black text-gray-500 z-10">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Línea Técnica</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Tiempo (Min)</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Stock Actual</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Seguridad</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Aprov.</th>
                      <th className="px-4 py-3">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px]">
                    {tiemposFiltrados.map((t, i) => (
                      <tr key={i} className="hover:bg-purple-50/30 transition-colors">
                        <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-200">{t.CodMaterial}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-200">
                          <div className="font-bold text-gray-700">{t.PuestoTrabajoLinea || t.Linea}</div>
                          <div className="text-[9px] text-gray-400 font-mono">{t.PuestoTrabajo}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-purple-700 font-black border-r border-dashed border-gray-200">
                          {t.Tiempo_Min ? Number(t.Tiempo_Min).toFixed(4) : '0.0000'}
                        </td>
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-200">{t.StockActual || 0}</td>
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-200">{t.StockSeguridad || 0}</td>
                        <td className="px-4 py-3 font-black text-green-600 border-r border-dashed border-gray-200">{t.ClaseAprovisionam}</td>
                        <td className="px-4 py-3 font-bold text-gray-400 uppercase text-[9px]">{t.NombRespControlProd || t.RespCtrlProd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
