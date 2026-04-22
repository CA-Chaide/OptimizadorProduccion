'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, Clock, Search, Filter, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

/**
 * TacticalPlanVentaExternaSection
 * 
 * Reestructurado profesionalmente:
 * 1. Órdenes Provisionales segmentadas por Centro 1000 y Centro 2000.
 * 2. Filtros de restricciones aplicados por separado para cada grupo.
 * 3. Doble scroll sincronizado y contenido centrado con bordes dashed.
 */
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

  // Estados de filtros locales
  const [filtersC1000, setFiltersC1000] = useState({ query: '', resp: '' });
  const [filtersC2000, setFiltersC2000] = useState({ query: '', resp: '' });
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
      setOrders(provRes.data || []);
      setOrdersFert(fertRes.data || []);

      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo);
        const payload = res.data;
        const dataArray = payload?.data ? (Array.isArray(payload.data) ? payload.data : [payload.data]) : 
                         (Array.isArray(payload) ? payload : []);

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

  // Lógica de filtrado por centro y grupo
  const filterByGroupRestrictions = (data: any[], centro: string, localFilters: any) => {
    const group = grupos.find(g => String(g.centro) === centro);
    if (!group) return [];

    const groupRestrictions = restricciones.filter(r => r.codigo_grupo === group.codigo_grupo);
    const respCodes = groupRestrictions
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almacenValues = groupRestrictions
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .map(r => r.valor_restriccion.trim())
      .filter(v => v !== '');

    return data.filter(item => {
      const itemResp = String(item.RESPCTRLPROD || item.RespCtrlProd || item.respCtrlProd || '').trim();
      const itemAlm = String(item.Almacen || item.ALMACEN || '').trim();
      const itemContent = JSON.stringify(item).toLowerCase();

      const matchRestriccion = (respCodes.length === 0 || respCodes.includes(itemResp)) &&
                              (almacenValues.length === 0 || almacenValues.includes(itemAlm));
      const matchQuery = !localFilters.query || itemContent.includes(localFilters.query.toLowerCase());
      const matchLocalResp = !localFilters.resp || itemResp === localFilters.resp;

      return matchRestriccion && matchQuery && matchLocalResp;
    });
  };

  const ordenesC1000 = useMemo(() => filterByGroupRestrictions(ordenes, '1000', filtersC1000), [ordenes, grupos, restricciones, filtersC1000]);
  const ordenesC2000 = useMemo(() => filterByGroupRestrictions(ordenes, '2000', filtersC2000), [ordenes, grupos, restricciones, filtersC2000]);
  
  const filteredFert = useMemo(() => {
    const allRespCodes = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()));
    
    return ordenesFert.filter(o => {
      const itemResp = String(o.RESPCTRLPROD || o.RespCtrlProd || '').trim();
      const matchRestriccion = allRespCodes.length === 0 || allRespCodes.includes(itemResp);
      const matchQuery = !filtersFert.query || JSON.stringify(o).toLowerCase().includes(filtersFert.query.toLowerCase());
      const matchLocalResp = !filtersFert.resp || itemResp === filtersFert.resp;
      return matchRestriccion && matchQuery && matchLocalResp;
    });
  }, [ordenesFert, restricciones, filtersFert]);

  const filteredTiempos = useMemo(() => {
    return tiemposEnsamblado.filter(t => {
      const itemResp = String(t.RespCtrlProd || t.RESPCTRLPROD || '').trim();
      const matchQuery = !filtersTiempos.query || JSON.stringify(t).toLowerCase().includes(filtersTiempos.query.toLowerCase());
      const matchLocalResp = !filtersTiempos.resp || itemResp === filtersTiempos.resp;
      return matchQuery && matchLocalResp;
    });
  }, [tiemposEnsamblado, filtersTiempos]);

  // Sincronización de scroll
  const setupScroll = (refGroup: any) => {
    if (!refGroup.top.current || !refGroup.bottom.current) return;
    const syncB = () => { if (refGroup.bottom.current) refGroup.bottom.current.scrollLeft = refGroup.top.current.scrollLeft; };
    const syncT = () => { if (refGroup.top.current) refGroup.top.current.scrollLeft = refGroup.bottom.current.scrollLeft; };
    refGroup.top.current.addEventListener('scroll', syncB);
    refGroup.bottom.current.addEventListener('scroll', syncT);
    return () => {
      refGroup.top.current?.removeEventListener('scroll', syncB);
      refGroup.bottom.current?.removeEventListener('scroll', syncT);
    };
  };

  useEffect(() => {
    if (activeTab === 'ordenes') {
      setupScroll(scrollRefs.c1000);
      setupScroll(scrollRefs.c2000);
      if (scrollRefs.c1000.table.current) scrollRefs.c1000.width[1](scrollRefs.c1000.table.current.offsetWidth);
      if (scrollRefs.c2000.table.current) scrollRefs.c2000.width[1](scrollRefs.c2000.table.current.offsetWidth);
    }
    if (activeTab === 'ordenesFert' && scrollRefs.fert.table.current) {
      scrollRefs.fert.width[1](scrollRefs.fert.table.current.offsetWidth);
      setupScroll(scrollRefs.fert);
    }
    if (activeTab === 'tiempos' && scrollRefs.tiempos.table.current) {
      scrollRefs.tiempos.width[1](scrollRefs.tiempos.table.current.offsetWidth);
      setupScroll(scrollRefs.tiempos);
    }
  }, [activeTab, ordenesC1000, ordenesC2000, filteredFert, filteredTiempos]);

  const FilterBar = ({ filters, setFilters, data }: { filters: any, setFilters: any, data: any[] }) => {
    const resps = useMemo(() => {
      const set = new Set<string>();
      data.forEach(d => {
        const val = d.RESPCTRLPROD || d.RespCtrlProd || d.respCtrlProd;
        if (val) set.add(String(val));
      });
      return Array.from(set).sort();
    }, [data]);

    return (
      <div className="flex flex-wrap gap-3 items-end mb-4 bg-gray-50/80 p-3 border border-dashed rounded-xl">
        <div className="flex-1 min-w-[150px]">
          <label className="text-[9px] font-bold text-gray-400 uppercase ml-1">Buscar</label>
          <Input 
            placeholder="Filtrar datos..." 
            value={filters.query}
            onChange={(e) => setFilters((f: any) => ({ ...f, query: e.target.value }))}
            className="h-8 rounded-lg text-xs"
          />
        </div>
        <div className="w-40">
          <label className="text-[9px] font-bold text-gray-400 uppercase ml-1">Responsable</label>
          <select 
            value={filters.resp}
            onChange={(e) => setFilters((f: any) => ({ ...f, resp: e.target.value }))}
            className="w-full h-8 border border-gray-200 rounded-lg px-2 text-xs bg-white"
          >
            <option value="">Todos</option>
            {resps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setFilters({ query: '', resp: '' })} className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-500">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  };

  const TableLayout = ({ refGroup, children }: { refGroup: any, children: React.ReactNode }) => (
    <div className="space-y-0">
      <div ref={refGroup.top} className="overflow-x-auto h-3 bg-gray-50/30 border-x rounded-t-lg">
        <div style={{ width: refGroup.width[0], height: '1px' }} />
      </div>
      <div ref={refGroup.bottom} className="overflow-x-auto border rounded-b-lg max-h-[450px]">
        {children}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-green-600" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Sincronizando Venta Externa...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-4 mb-6">
        <div className="bg-green-600 p-3 rounded-2xl shadow-lg shadow-green-200">
          <ShoppingCart className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Venta Externa</h2>
          <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50 font-bold px-3">Catálogo de Planificación</Badge>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full bg-gray-100/50 p-1.5 rounded-2xl mb-8 border border-gray-200 shadow-inner">
          <TabsTrigger value="grupos" className="flex-1 py-3 text-xs font-black uppercase data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl transition-all">Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="flex-1 py-3 text-xs font-black uppercase data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl transition-all">Restricciones</TabsTrigger>
          <TabsTrigger value="ordenes" className="flex-1 py-3 text-xs font-black uppercase data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl transition-all">Provisionales</TabsTrigger>
          <TabsTrigger value="ordenesFert" className="flex-1 py-3 text-xs font-black uppercase data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl transition-all">Órdenes Fert</TabsTrigger>
          <TabsTrigger value="tiempos" className="flex-1 py-3 text-xs font-black uppercase data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl transition-all">Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {grupos.map(g => (
                  <div key={g.codigo_grupo} className="p-6 border-2 border-dashed border-gray-100 rounded-3xl bg-gray-50/50 hover:border-green-400 hover:bg-white hover:shadow-2xl transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="space-y-1">
                        <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Planta de Producción</span>
                        <span className="text-2xl font-black text-gray-800 group-hover:text-green-600 transition-colors">Centro {g.centro}</span>
                      </div>
                      <Badge className="bg-green-600 text-white border-none font-black px-4 py-1 rounded-full shadow-lg shadow-green-100">C-{g.centro}</Badge>
                    </div>
                    <div className="pt-4 border-t border-dashed border-gray-200">
                      <h4 className="font-bold text-gray-700 uppercase text-sm mb-1">{g.nombre_grupo}</h4>
                      <p className="text-[10px] text-gray-400 font-mono">UUID-REG: {g.codigo_grupo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                      <th className="px-8 py-5 border-r border-dashed border-gray-200">Identificador</th>
                      <th className="px-8 py-5 border-r border-dashed border-gray-200">Valor Operativo</th>
                      <th className="px-8 py-5">Especificación del Parámetro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {restricciones.map(r => (
                      <tr key={r.codigo_restriccion} className="hover:bg-green-50/30 transition-colors group">
                        <td className="px-8 py-6 font-black text-gray-800 border-r border-dashed border-gray-200 group-hover:text-green-700">{r.nombre_restriccion}</td>
                        <td className="px-8 py-6 border-r border-dashed border-gray-200">
                          <span className="font-mono text-sm px-4 py-1.5 rounded-xl bg-gray-100 text-gray-600 border border-gray-200 group-hover:border-green-200 group-hover:bg-green-50 group-hover:text-green-700 transition-all">
                            {r.valor_restriccion}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-sm text-gray-400 font-medium italic">{r.description || r.descripcion || 'Configuración estándar del sistema'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <div className="grid grid-cols-1 gap-8">
            {/* SECCIÓN CENTRO 1000 */}
            <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
              <CardHeader className="bg-gray-50/80 border-b border-gray-100 flex flex-row items-center justify-between px-8 py-5">
                <div>
                  <CardTitle className="text-xl font-black text-gray-800 uppercase tracking-tighter">Centro 1000 - Quito</CardTitle>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Órdenes Provisionales Venta Externa</p>
                </div>
                <Badge className="bg-green-600 text-white font-black px-4 rounded-full">{ordenesC1000.length} REG</Badge>
              </CardHeader>
              <CardContent className="p-8">
                <FilterBar filters={filtersC1000} setFilters={setFiltersC1000} data={ordenes} />
                <TableLayout refGroup={scrollRefs.c1000}>
                  <table ref={scrollRefs.c1000.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-50/80 sticky top-0 z-10 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                      <tr>
                        <th className="px-6 py-4 border-r border-dashed border-gray-200">Orden</th>
                        <th className="px-6 py-4 border-r border-dashed border-gray-200">Cod. Material</th>
                        <th className="px-6 py-4 border-r border-dashed border-gray-200">Descripción del Bien</th>
                        <th className="px-6 py-4 border-r border-dashed border-gray-200">Unidades</th>
                        <th className="px-6 py-4 border-r border-dashed border-gray-200">Almacén</th>
                        <th className="px-6 py-4">Resp. Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {ordenesC1000.map((o, idx) => (
                        <tr key={idx} className="hover:bg-green-50/30 transition-colors group">
                          <td className="px-6 py-5 font-black text-gray-800 border-r border-dashed border-gray-200 group-hover:text-green-700">{o.ORDENPREVISIONAL}</td>
                          <td className="px-6 py-5 font-mono text-xs text-green-600 font-bold border-r border-dashed border-gray-200">{o.MATERIAL}</td>
                          <td className="px-6 py-5 border-r border-dashed border-gray-200 text-xs text-gray-500 font-bold uppercase truncate max-w-[300px]">{o.NOMBRE}</td>
                          <td className="px-6 py-5 font-black text-gray-800 border-r border-dashed border-gray-200">{o.CANTIDAD}</td>
                          <td className="px-6 py-5 text-gray-500 font-bold border-r border-dashed border-gray-200">{o.Almacen || o.ALMACEN}</td>
                          <td className="px-6 py-5 text-[10px] text-gray-400 font-bold">{o.NombRespControlProd || o.RespCtrlProd}</td>
                        </tr>
                      ))}
                      {ordenesC1000.length === 0 && (
                        <tr><td colSpan={6} className="py-20 text-gray-300 font-bold uppercase tracking-widest text-xs italic">No hay órdenes para el Centro 1000</td></tr>
                      )}
                    </tbody>
                  </table>
                </TableLayout>
              </CardContent>
            </Card>

            {/* SECCIÓN CENTRO 2000 */}
            <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
              <CardHeader className="bg-gray-50/80 border-b border-gray-100 flex flex-row items-center justify-between px-8 py-5">
                <div>
                  <CardTitle className="text-xl font-black text-gray-800 uppercase tracking-tighter">Centro 2000 - Guayaquil</CardTitle>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Órdenes Provisionales Venta Externa</p>
                </div>
                <Badge className="bg-blue-600 text-white font-black px-4 rounded-full">{ordenesC2000.length} REG</Badge>
              </CardHeader>
              <CardContent className="p-8">
                <FilterBar filters={filtersC2000} setFilters={setFiltersC2000} data={ordenes} />
                <TableLayout refGroup={scrollRefs.c2000}>
                  <table ref={scrollRefs.c2000.table} className="w-full text-center border-collapse">
                    <thead className="bg-gray-50/80 sticky top-0 z-10 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                      <tr>
                        <th className="px-6 py-4 border-r border-dashed border-gray-200">Orden</th>
                        <th className="px-6 py-4 border-r border-dashed border-gray-200">Cod. Material</th>
                        <th className="px-6 py-4 border-r border-dashed border-gray-200">Descripción del Bien</th>
                        <th className="px-6 py-4 border-r border-dashed border-gray-200">Unidades</th>
                        <th className="px-6 py-4 border-r border-dashed border-gray-200">Almacén</th>
                        <th className="px-6 py-4">Resp. Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {ordenesC2000.map((o, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                          <td className="px-6 py-5 font-black text-gray-800 border-r border-dashed border-gray-200 group-hover:text-blue-700">{o.ORDENPREVISIONAL}</td>
                          <td className="px-6 py-5 font-mono text-xs text-blue-600 font-bold border-r border-dashed border-gray-200">{o.MATERIAL}</td>
                          <td className="px-6 py-5 border-r border-dashed border-gray-200 text-xs text-gray-500 font-bold uppercase truncate max-w-[300px]">{o.NOMBRE}</td>
                          <td className="px-6 py-5 font-black text-gray-800 border-r border-dashed border-gray-200">{o.CANTIDAD}</td>
                          <td className="px-6 py-5 text-gray-500 font-bold border-r border-dashed border-gray-200">{o.Almacen || o.ALMACEN}</td>
                          <td className="px-6 py-5 text-[10px] text-gray-400 font-bold">{o.NombRespControlProd || o.RespCtrlProd}</td>
                        </tr>
                      ))}
                      {ordenesC2000.length === 0 && (
                        <tr><td colSpan={6} className="py-20 text-gray-300 font-bold uppercase tracking-widest text-xs italic">No hay órdenes para el Centro 2000</td></tr>
                      )}
                    </tbody>
                  </table>
                </TableLayout>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ordenesFert">
          <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
            <CardHeader className="bg-gray-50/80 border-b border-gray-100 flex flex-row items-center justify-between px-8 py-5">
              <div>
                <CardTitle className="text-xl font-black text-gray-800 uppercase tracking-tighter">Órdenes de Producto Terminado (FERT)</CardTitle>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Venta Externa - Consolidado de Centros</p>
              </div>
              <Badge className="bg-indigo-600 text-white font-black px-4 rounded-full">{filteredFert.length} REG</Badge>
            </CardHeader>
            <CardContent className="p-8">
              <FilterBar filters={filtersFert} setFilters={setFiltersFert} data={ordenesFert} />
              <TableLayout refGroup={scrollRefs.fert}>
                <table ref={scrollRefs.fert.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-50/80 sticky top-0 z-10 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                    <tr>
                      <th className="px-6 py-4 border-r border-dashed border-gray-200">Orden Fert</th>
                      <th className="px-6 py-4 border-r border-dashed border-gray-200">Material / Código</th>
                      <th className="px-6 py-4 border-r border-dashed border-gray-200">Cantidad</th>
                      <th className="px-6 py-4 border-r border-dashed border-gray-200">Almacén</th>
                      <th className="px-6 py-4">Resp. Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredFert.map((o, idx) => (
                      <tr key={idx} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="px-6 py-5 font-black text-gray-800 border-r border-dashed border-gray-200 group-hover:text-indigo-700">{o.Orden || o.ORDENFERT}</td>
                        <td className="px-6 py-5 border-r border-dashed border-gray-200">
                          <div className="font-mono text-xs text-indigo-600 font-bold">{o.CodMaterial || o.MATERIAL}</div>
                          <div className="text-[10px] text-gray-400 font-bold uppercase truncate max-w-[250px] mx-auto">{o.Descripcion || o.NOMBRE}</div>
                        </td>
                        <td className="px-6 py-5 font-black text-gray-800 border-r border-dashed border-gray-200">{o.Cantidad || o.CANTIDAD}</td>
                        <td className="px-6 py-5 text-gray-500 font-bold border-r border-dashed border-gray-200">{o.Almacen || o.ALMACEN}</td>
                        <td className="px-6 py-5 text-[10px] text-gray-400 font-bold">{o.NombRespControlProd || o.RespCtrlProd}</td>
                      </tr>
                    ))}
                    {filteredFert.length === 0 && (
                      <tr><td colSpan={5} className="py-20 text-gray-300 font-bold uppercase tracking-widest text-xs italic">No hay órdenes Fert identificadas</td></tr>
                    )}
                  </tbody>
                </table>
              </TableLayout>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
            <CardHeader className="bg-gray-50/80 border-b border-gray-100 flex flex-row items-center justify-between px-8 py-5">
              <div>
                <CardTitle className="text-xl font-black text-gray-800 uppercase tracking-tighter">Tiempos Estándar de Fabricación</CardTitle>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Catálogo Técnico de Venta Externa</p>
              </div>
              <Badge className="bg-purple-600 text-white font-black px-4 rounded-full">{filteredTiempos.length} REG</Badge>
            </CardHeader>
            <CardContent className="p-8">
              <FilterBar filters={filtersTiempos} setFilters={setFiltersTiempos} data={tiemposEnsamblado} />
              <TableLayout refGroup={scrollRefs.tiempos}>
                <table ref={scrollRefs.tiempos.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-50/80 sticky top-0 z-10 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                    <tr>
                      <th className="px-5 py-4 border-r border-dashed border-gray-200">Material</th>
                      <th className="px-5 py-4 border-r border-dashed border-gray-200">Centro</th>
                      <th className="px-5 py-4 border-r border-dashed border-gray-200">Línea de Ensamble</th>
                      <th className="px-5 py-4 border-r border-dashed border-gray-200">T. Estándar (Min)</th>
                      <th className="px-5 py-4 border-r border-dashed border-gray-200">Stock Hoy</th>
                      <th className="px-5 py-4 border-r border-dashed border-gray-200">Seguridad</th>
                      <th className="px-5 py-4 border-r border-dashed border-gray-200">Aprov.</th>
                      <th className="px-5 py-4">Resp.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredTiempos.map((t, idx) => (
                      <tr key={idx} className="hover:bg-purple-50/30 transition-colors group">
                        <td className="px-5 py-5 font-black text-gray-800 border-r border-dashed border-gray-200 group-hover:text-purple-700">{t.CodMaterial}</td>
                        <td className="px-5 py-5 text-gray-500 font-bold border-r border-dashed border-gray-200">C-{t.Centro}</td>
                        <td className="px-5 py-5 border-r border-dashed border-gray-200">
                          <div className="text-[11px] font-black text-gray-700 uppercase leading-none">{t.PuestoTrabajoLinea || t.Linea}</div>
                          <div className="text-[9px] text-gray-400 mt-1 font-mono uppercase">{t.PuestoTrabajo}</div>
                        </td>
                        <td className="px-5 py-5 font-mono text-sm text-purple-700 font-black border-r border-dashed border-gray-200">
                          {t.Tiempo_Min ? Number(t.Tiempo_Min).toFixed(4) : '0.0000'}
                        </td>
                        <td className="px-5 py-5 font-mono text-gray-600 border-r border-dashed border-gray-200">{t.StockActual || 0}</td>
                        <td className="px-5 py-5 font-mono text-gray-400 border-r border-dashed border-gray-200">{t.StockSeguridad || 0}</td>
                        <td className="px-5 py-5 font-black text-teal-600 border-r border-dashed border-gray-200">{t.ClaseAprovisionam || 'E'}</td>
                        <td className="px-5 py-5 text-[10px] text-gray-400 font-bold uppercase">{t.RespCtrlProd}</td>
                      </tr>
                    ))}
                    {filteredTiempos.length === 0 && (
                      <tr><td colSpan={8} className="py-20 text-gray-300 font-bold uppercase tracking-widest text-xs italic">No hay tiempos técnicos cargados</td></tr>
                    )}
                  </tbody>
                </table>
              </TableLayout>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
