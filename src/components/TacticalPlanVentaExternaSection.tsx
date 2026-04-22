'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, Clock, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

  // Estados de filtros internos por tab
  const [filtersProv1000, setFiltersProv1000] = useState({ query: '', resp: '' });
  const [filtersProv2000, setFiltersProv2000] = useState({ query: '', resp: '' });
  const [filtersFert, setFiltersFert] = useState({ query: '', resp: '' });
  const [filtersTiempos, setFiltersTiempos] = useState({ query: '', resp: '' });

  // Refs para sincronización de scroll
  const scrollRefs = {
    c1000: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) },
    c2000: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) },
    fert: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) },
    tiempos: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) }
  };

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
      
      // La API devuelve { data: [], length: X }
      setOrders(provRes.data || []);
      setOrdersFert(fertRes.data || []);

      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo);
        const payload = res.data;
        const dataArray = Array.isArray(payload) ? payload : (payload?.data || []);
        
        if (dataArray.length > 0) {
          allTiempos.push(...dataArray);
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

  // Lógica de filtrado por centro y grupo específica
  const getFilteredOrdersForCenter = (centro: string, localFilters: any) => {
    const group = grupos.find(g => String(g.centro) === centro);
    if (!group) return [];

    const groupRest = restricciones.filter(r => r.codigo_grupo === group.codigo_grupo);
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
      const content = JSON.stringify(o).toLowerCase();

      const matchRest = (respCodes.length === 0 || respCodes.includes(itemResp)) &&
                       (almCodes.length === 0 || almCodes.includes(itemAlm));
      const matchQuery = !localFilters.query || content.includes(localFilters.query.toLowerCase());
      const matchLocalResp = !localFilters.resp || itemResp === localFilters.resp;

      return matchRest && matchQuery && matchLocalResp;
    });
  };

  const ordenesC1000 = useMemo(() => getFilteredOrdersForCenter('1000', filtersProv1000), [ordenes, grupos, restricciones, filtersProv1000]);
  const ordenesC2000 = useMemo(() => getFilteredOrdersForCenter('2000', filtersProv2000), [ordenes, grupos, restricciones, filtersProv2000]);

  const fertFiltradas = useMemo(() => {
    const allResps = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()));

    return ordenesFert.filter(o => {
      const itemResp = String(o.RESPCTRLPROD || o.RespCtrlProd || '').trim();
      const matchRest = allResps.length === 0 || allResps.includes(itemResp);
      const matchQuery = !filtersFert.query || JSON.stringify(o).toLowerCase().includes(filtersFert.query.toLowerCase());
      const matchLocalResp = !filtersFert.resp || itemResp === filtersFert.resp;
      return matchRest && matchQuery && matchLocalResp;
    });
  }, [ordenesFert, restricciones, filtersFert]);

  const tiemposFiltrados = useMemo(() => {
    return tiemposEnsamblado.filter(t => {
      const itemResp = String(t.RespCtrlProd || t.RESPCTRLPROD || '').trim();
      const matchQuery = !filtersTiempos.query || JSON.stringify(t).toLowerCase().includes(filtersTiempos.query.toLowerCase());
      const matchLocalResp = !filtersTiempos.resp || itemResp === filtersTiempos.resp;
      return matchQuery && matchLocalResp;
    });
  }, [tiemposEnsamblado, filtersTiempos]);

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
    if (activeTab === 'ordenes') {
      setupScroll(scrollRefs.c1000);
      setupScroll(scrollRefs.c2000);
      if (scrollRefs.c1000.table.current) scrollRefs.c1000.width[1](scrollRefs.c1000.table.current.offsetWidth);
      if (scrollRefs.c2000.table.current) scrollRefs.c2000.width[1](scrollRefs.c2000.table.current.offsetWidth);
    } else if (activeTab === 'ordenesFert') {
      setupScroll(scrollRefs.fert);
      if (scrollRefs.fert.table.current) scrollRefs.fert.width[1](scrollRefs.fert.table.current.offsetWidth);
    } else if (activeTab === 'tiempos') {
      setupScroll(scrollRefs.tiempos);
      if (scrollRefs.tiempos.table.current) scrollRefs.tiempos.width[1](scrollRefs.tiempos.table.current.offsetWidth);
    }
  }, [activeTab, ordenesC1000, ordenesC2000, fertFiltradas, tiemposFiltrados]);

  const FilterPanel = ({ filters, setFilters, data }: { filters: any, setFilters: any, data: any[] }) => {
    const resps = useMemo(() => {
      const set = new Set<string>();
      data.forEach(d => {
        const val = d.RESPCTRLPROD || d.RespCtrlProd || d.respCtrlProd;
        if (val) set.add(String(val));
      });
      return Array.from(set).sort();
    }, [data]);

    return (
      <div className="flex gap-3 items-end mb-4 bg-gray-50/50 p-3 border border-dashed rounded-xl">
        <div className="flex-1">
          <Input 
            placeholder="Buscar material o código..." 
            value={filters.query}
            onChange={(e) => setFilters((f: any) => ({ ...f, query: e.target.value }))}
            className="h-9 text-xs"
          />
        </div>
        <div className="w-48">
          <select 
            value={filters.resp}
            onChange={(e) => setFilters((f: any) => ({ ...f, resp: e.target.value }))}
            className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs bg-white"
          >
            <option value="">Todos los Responsables</option>
            {resps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setFilters({ query: '', resp: '' })}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  };

  const TableWrapper = ({ refGroup, children }: { refGroup: any, children: React.ReactNode }) => (
    <div className="space-y-0">
      <div ref={refGroup.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-lg">
        <div style={{ width: refGroup.width[0], height: '1px' }} />
      </div>
      <div ref={refGroup.bottom} className="overflow-x-auto border rounded-b-lg max-h-[400px]">
        {children}
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-4 mb-4">
        <div className="bg-green-600 p-3 rounded-2xl">
          <ShoppingCart className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase">Programación Táctica Venta Externa</h2>
          <p className="text-sm text-gray-500">Segmentación por Planta y Catálogo Técnico</p>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="restricciones">Restricciones</TabsTrigger>
          <TabsTrigger value="ordenes">Provisionales</TabsTrigger>
          <TabsTrigger value="ordenesFert">Órdenes Fert</TabsTrigger>
          <TabsTrigger value="tiempos">Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card>
            <CardHeader><CardTitle>Grupos de Venta Externa</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grupos.map(g => (
                  <div key={g.codigo_grupo} className="p-6 border-2 border-dashed rounded-2xl bg-gray-50">
                    <Badge className="bg-green-600 mb-2">Centro {g.centro}</Badge>
                    <h4 className="font-bold text-gray-800 uppercase">{g.nombre_grupo}</h4>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card>
            <CardHeader><CardTitle>Parámetros de Filtrado</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-center border-collapse">
                  <thead className="bg-gray-50">
                    <tr className="text-[10px] font-bold uppercase text-gray-400">
                      <th className="px-6 py-4 border-r border-dashed">Parámetro</th>
                      <th className="px-6 py-4 border-r border-dashed">Valor</th>
                      <th className="px-6 py-4">Descripción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {restricciones.map(r => (
                      <tr key={r.codigo_restriccion} className="hover:bg-green-50/30">
                        <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed">{r.nombre_restriccion}</td>
                        <td className="px-6 py-4 border-r border-dashed">
                          <Badge variant="outline" className="font-mono text-green-700 border-green-200">{r.valor_restriccion}</Badge>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-400 italic">{r.descripcion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <div className="space-y-8">
            <Card>
              <CardHeader className="flex flex-row justify-between items-center bg-gray-50/50">
                <CardTitle className="text-lg">Centro 1000 - Quito</CardTitle>
                <Badge className="bg-green-600">{ordenesC1000.length}</Badge>
              </CardHeader>
              <CardContent className="p-6">
                <FilterPanel filters={filtersProv1000} setFilters={setFiltersProv1000} data={ordenes} />
                <TableWrapper refGroup={scrollRefs.c1000}>
                  <table ref={scrollRefs.c1000.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-bold text-gray-500">
                      <tr>
                        <th className="px-4 py-3 border-r border-dashed">Orden</th>
                        <th className="px-4 py-3 border-r border-dashed">Material</th>
                        <th className="px-4 py-3 border-r border-dashed">Descripción</th>
                        <th className="px-4 py-3 border-r border-dashed">Unidades</th>
                        <th className="px-4 py-3 border-r border-dashed">Almacén</th>
                        <th className="px-4 py-3">Responsable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-xs">
                      {ordenesC1000.map((o, i) => (
                        <tr key={i} className="hover:bg-green-50/30">
                          <td className="px-4 py-4 font-bold border-r border-dashed">{o.ORDENPREVISIONAL}</td>
                          <td className="px-4 py-4 font-mono text-green-600 border-r border-dashed">{o.MATERIAL}</td>
                          <td className="px-4 py-4 border-r border-dashed max-w-xs truncate">{o.NOMBRE}</td>
                          <td className="px-4 py-4 font-black border-r border-dashed">{o.CANTIDAD}</td>
                          <td className="px-4 py-4 border-r border-dashed font-bold text-gray-500">{o.Almacen}</td>
                          <td className="px-4 py-4 text-[10px] text-gray-400 font-bold">{o.NombRespControlProd || o.RespCtrlProd}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row justify-between items-center bg-gray-50/50">
                <CardTitle className="text-lg">Centro 2000 - Guayaquil</CardTitle>
                <Badge className="bg-blue-600">{ordenesC2000.length}</Badge>
              </CardHeader>
              <CardContent className="p-6">
                <FilterPanel filters={filtersProv2000} setFilters={setFiltersProv2000} data={ordenes} />
                <TableWrapper refGroup={scrollRefs.c2000}>
                  <table ref={scrollRefs.c2000.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-bold text-gray-500">
                      <tr>
                        <th className="px-4 py-3 border-r border-dashed">Orden</th>
                        <th className="px-4 py-3 border-r border-dashed">Material</th>
                        <th className="px-4 py-3 border-r border-dashed">Descripción</th>
                        <th className="px-4 py-3 border-r border-dashed">Unidades</th>
                        <th className="px-4 py-3 border-r border-dashed">Almacén</th>
                        <th className="px-4 py-3">Responsable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-xs">
                      {ordenesC2000.map((o, i) => (
                        <tr key={i} className="hover:bg-blue-50/30">
                          <td className="px-4 py-4 font-bold border-r border-dashed">{o.ORDENPREVISIONAL}</td>
                          <td className="px-4 py-4 font-mono text-blue-600 border-r border-dashed">{o.MATERIAL}</td>
                          <td className="px-4 py-4 border-r border-dashed max-w-xs truncate">{o.NOMBRE}</td>
                          <td className="px-4 py-4 font-black border-r border-dashed">{o.CANTIDAD}</td>
                          <td className="px-4 py-4 border-r border-dashed font-bold text-gray-500">{o.Almacen}</td>
                          <td className="px-4 py-4 text-[10px] text-gray-400 font-bold">{o.NombRespControlProd || o.RespCtrlProd}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ordenesFert">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>Órdenes de Producto Terminado (FERT)</CardTitle>
              <Badge className="bg-indigo-600">{fertFiltradas.length}</Badge>
            </CardHeader>
            <CardContent>
              <FilterPanel filters={filtersFert} setFilters={setFiltersFert} data={ordenesFert} />
              <TableWrapper refGroup={scrollRefs.fert}>
                <table ref={scrollRefs.fert.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-bold text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed">Orden Fert</th>
                      <th className="px-4 py-3 border-r border-dashed">Material</th>
                      <th className="px-4 py-3 border-r border-dashed">Descripción</th>
                      <th className="px-4 py-3 border-r border-dashed">Unidades</th>
                      <th className="px-4 py-3">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-xs">
                    {fertFiltradas.map((o, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30">
                        <td className="px-4 py-4 font-bold border-r border-dashed">{o.Orden || o.ORDENFERT}</td>
                        <td className="px-4 py-4 font-mono text-indigo-600 border-r border-dashed">{o.CodMaterial || o.MATERIAL}</td>
                        <td className="px-4 py-4 border-r border-dashed max-w-xs truncate">{o.Descripcion || o.NOMBRE}</td>
                        <td className="px-4 py-4 font-black border-r border-dashed">{o.Cantidad || o.CANTIDAD}</td>
                        <td className="px-4 py-4 text-[10px] text-gray-400 font-bold">{o.NombRespControlProd || o.RespCtrlProd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>Catálogo de Tiempos Técnicos</CardTitle>
              <Badge className="bg-purple-600">{tiemposFiltrados.length}</Badge>
            </CardHeader>
            <CardContent>
              <FilterPanel filters={filtersTiempos} setFilters={setFiltersTiempos} data={tiemposEnsamblado} />
              <TableWrapper refGroup={scrollRefs.tiempos}>
                <table ref={scrollRefs.tiempos.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-bold text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed">Material</th>
                      <th className="px-4 py-3 border-r border-dashed">Centro</th>
                      <th className="px-4 py-3 border-r border-dashed">Línea Técnica</th>
                      <th className="px-4 py-3 border-r border-dashed">T. Estándar (Min)</th>
                      <th className="px-4 py-3 border-r border-dashed">Stock Actual</th>
                      <th className="px-4 py-3 border-r border-dashed">Seguridad</th>
                      <th className="px-4 py-3 border-r border-dashed">Aprov.</th>
                      <th className="px-4 py-3">Resp.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-xs">
                    {tiemposFiltrados.map((t, i) => (
                      <tr key={i} className="hover:bg-purple-50/30">
                        <td className="px-4 py-4 font-black text-gray-800 border-r border-dashed">{t.CodMaterial}</td>
                        <td className="px-4 py-4 font-bold text-gray-400 border-r border-dashed">C-{t.Centro}</td>
                        <td className="px-4 py-4 border-r border-dashed">
                          <div className="font-bold text-gray-700">{t.PuestoTrabajoLinea || t.Linea}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{t.PuestoTrabajo}</div>
                        </td>
                        <td className="px-4 py-4 font-mono text-purple-700 font-black border-r border-dashed">
                          {t.Tiempo_Min ? Number(t.Tiempo_Min).toFixed(4) : '0.0000'}
                        </td>
                        <td className="px-4 py-4 font-mono border-r border-dashed">{t.StockActual || 0}</td>
                        <td className="px-4 py-4 font-mono border-r border-dashed">{t.StockSeguridad || 0}</td>
                        <td className="px-4 py-4 font-bold text-green-600 border-r border-dashed">{t.ClaseAprovisionam}</td>
                        <td className="px-4 py-4 text-[10px] text-gray-400 font-bold uppercase">{t.RespCtrlProd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
