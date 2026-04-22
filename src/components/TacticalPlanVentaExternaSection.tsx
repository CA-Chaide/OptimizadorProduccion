
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, FileText, Clock, Search, Filter, X } from 'lucide-react';
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
 * 1. Filtros individuales DENTRO de cada tab operativo.
 * 2. Recuperación de tiempos mediante getTiemposEnsambladobyCentroyCodigoGrupo.
 * 3. Procesamiento de respuesta { data: [], length }.
 * 4. Doble scroll sincronizado y contenido centrado con bordes dashed.
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

  // Estados de filtros locales por Tab
  const [filtersOrders, setFiltersOrders] = useState({ query: '', resp: '' });
  const [filtersFert, setFiltersFert] = useState({ query: '', resp: '' });
  const [filtersTiempos, setFiltersTiempos] = useState({ query: '', resp: '' });

  // Refs para sincronización de scroll
  const syncRefs = {
    ordenes: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) },
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
      // 1. Cargar Órdenes Provisionales
      const provRes = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      setOrders(provRes.data || []);

      // 2. Cargar Órdenes Fert
      const fertRes = await serviciosService.getOrdenesFert(1, 20000);
      setOrdersFert(fertRes.data || []);

      // 3. Cargar Tiempos usando el método específico por cada grupo
      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        console.log(`[Venta Externa] Consultando tiempos para Centro: ${g.centro}, Grupo: ${g.codigo_grupo}`);
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo);
        
        // Manejar estructura { data: [], length }
        const payload = res.data;
        const dataArray = payload?.data ? (Array.isArray(payload.data) ? payload.data : [payload.data]) : 
                         (Array.isArray(payload) ? payload : []);

        if (dataArray.length > 0) {
          allTiempos.push(...dataArray);
        }
      }
      setTiemposEnsamblado(allTiempos);
      inspector.captureVariable('tiemposVentaExterna', allTiempos.length);
    } catch (error) {
      console.error('Error cargando datos operativos:', error);
      addNotification('error', 'Error al recuperar datos de la API');
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

  // Lógica de filtrado base por RESPCTRLPROD
  const getRespCodesFromRestrictions = () => {
    return restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
  };

  const applyFilters = (data: any[], localFilters: { query: string, resp: string }) => {
    const respCodes = getRespCodesFromRestrictions();
    
    return data.filter(item => {
      // Campos dinámicos para responsables y materiales
      const itemResp = String(item.RESPCTRLPROD || item.RespCtrlProd || item.respCtrlProd || '').trim();
      const itemNameResp = String(item.NombRespControlProd || item.RespCtrlProd || '').toLowerCase();
      const itemContent = JSON.stringify(item).toLowerCase();

      const matchRestriccion = respCodes.length === 0 || respCodes.includes(itemResp);
      const matchQuery = !localFilters.query || itemContent.includes(localFilters.query.toLowerCase());
      const matchLocalResp = !localFilters.resp || itemNameResp === localFilters.resp.toLowerCase() || itemResp === localFilters.resp;

      return matchRestriccion && matchQuery && matchLocalResp;
    });
  };

  // Datos filtrados para cada Tab
  const filteredOrders = useMemo(() => applyFilters(ordenes, filtersOrders), [ordenes, restricciones, filtersOrders]);
  const filteredFert = useMemo(() => applyFilters(ordenesFert, filtersFert), [ordenesFert, restricciones, filtersFert]);
  const filteredTiempos = useMemo(() => applyFilters(tiemposEnsamblado, filtersTiempos), [tiemposEnsamblado, restricciones, filtersTiempos]);

  // Lista única de responsables para selectores
  const getUniqueResponsibles = (data: any[]) => {
    const resps = new Set<string>();
    data.forEach(o => {
      const name = o.NombRespControlProd || o.RespCtrlProd || o.RESPCTRLPROD;
      if (name) resps.add(String(name));
    });
    return Array.from(resps).sort();
  };

  const respsOrders = useMemo(() => getUniqueResponsibles(ordenes), [ordenes]);
  const respsFert = useMemo(() => getUniqueResponsibles(ordenesFert), [ordenesFert]);
  const respsTiempos = useMemo(() => getUniqueResponsibles(tiemposEnsamblado), [tiemposEnsamblado]);

  // Sincronización de scroll
  const setupScroll = (refGroup: any) => {
    if (!refGroup.top.current || !refGroup.bottom.current) return;
    const syncB = () => { refGroup.bottom.current.scrollLeft = refGroup.top.current.scrollLeft; };
    const syncT = () => { refGroup.top.current.scrollLeft = refGroup.bottom.current.scrollLeft; };
    refGroup.top.current.addEventListener('scroll', syncB);
    refGroup.bottom.current.addEventListener('scroll', syncT);
    return () => {
      refGroup.top.current?.removeEventListener('scroll', syncB);
      refGroup.bottom.current?.removeEventListener('scroll', syncT);
    };
  };

  useEffect(() => {
    if (activeTab === 'ordenes' && syncRefs.ordenes.table.current) {
      syncRefs.ordenes.width[1](syncRefs.ordenes.table.current.offsetWidth);
      return setupScroll(syncRefs.ordenes);
    }
    if (activeTab === 'ordenesFert' && syncRefs.fert.table.current) {
      syncRefs.fert.width[1](syncRefs.fert.table.current.offsetWidth);
      return setupScroll(syncRefs.fert);
    }
    if (activeTab === 'tiempos' && syncRefs.tiempos.table.current) {
      syncRefs.tiempos.width[1](syncRefs.tiempos.table.current.offsetWidth);
      return setupScroll(syncRefs.tiempos);
    }
  }, [activeTab, filteredOrders, filteredFert, filteredTiempos]);

  // Componente de barra de filtros local
  const FilterBar = ({ 
    filters, 
    setFilters, 
    resps 
  }: { 
    filters: { query: string, resp: string }, 
    setFilters: any, 
    resps: string[] 
  }) => (
    <div className="flex flex-wrap gap-4 items-end mb-4 bg-gray-50 p-4 border rounded-2xl shadow-sm">
      <div className="flex-1 min-w-[200px] space-y-1">
        <label className="text-[10px] font-bold text-gray-400 uppercase">Buscar Material / Código</label>
        <Input 
          placeholder="Filtrar..." 
          value={filters.query}
          onChange={(e) => setFilters((f: any) => ({ ...f, query: e.target.value }))}
          className="h-10 rounded-xl"
        />
      </div>
      <div className="w-64 space-y-1">
        <label className="text-[10px] font-bold text-gray-400 uppercase">Responsable</label>
        <select 
          value={filters.resp}
          onChange={(e) => setFilters((f: any) => ({ ...f, resp: e.target.value }))}
          className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white"
        >
          <option value="">Todos</option>
          {resps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <Button 
        variant="ghost" 
        size="sm"
        onClick={() => setFilters({ query: '', resp: '' })}
        className="h-10 text-gray-400 hover:text-red-600"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-green-600" />
        <p className="text-gray-500 font-bold">Cargando Planificación de Venta Externa...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3 mb-4">
        <ShoppingCart className="w-10 h-10 text-green-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-800 uppercase tracking-tight">Programación Táctica Venta Externa</h2>
          <p className="text-sm text-gray-500 font-medium">Gestión especializada por Centro y Código de Grupo</p>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full bg-gray-100/60 p-1.5 rounded-2xl mb-8 border border-gray-200">
          <TabsTrigger value="grupos" className="flex-1 py-3 text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl flex items-center justify-center gap-2"><Users className="w-4 h-4" /> Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="flex-1 py-3 text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl flex items-center justify-center gap-2"><Lock className="w-4 h-4" /> Restricciones</TabsTrigger>
          <TabsTrigger value="ordenes" className="flex-1 py-3 text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl flex items-center justify-center gap-2"><Package className="w-4 h-4" /> Provisionales</TabsTrigger>
          <TabsTrigger value="ordenesFert" className="flex-1 py-3 text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl flex items-center justify-center gap-2"><FileText className="w-4 h-4" /> Órdenes Fert</TabsTrigger>
          <TabsTrigger value="tiempos" className="flex-1 py-3 text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl flex items-center justify-center gap-2"><Clock className="w-4 h-4" /> Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card className="border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-gray-50 border-b">
              <CardTitle>Grupos Operativos Identificados</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {grupos.map(g => (
                  <div key={g.codigo_grupo} className="p-6 border-2 border-dashed border-gray-200 rounded-2xl bg-white hover:border-green-400 hover:shadow-xl transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <span className="font-bold text-xl text-gray-800">{g.nombre_grupo}</span>
                      <Badge className="bg-green-100 text-green-800 border-green-200 uppercase font-bold">C-{g.centro}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 font-mono">CÓDIGO: {g.codigo_grupo}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-gray-50 border-b">
              <CardTitle>Restricciones del Área</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-center">
                <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-500">
                  <tr>
                    <th className="px-6 py-4 border-r border-dashed border-gray-200">Parámetro</th>
                    <th className="px-6 py-4 border-r border-dashed border-gray-200">Valor Configurado</th>
                    <th className="px-6 py-4">Descripción Técnica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {restricciones.map(r => (
                    <tr key={r.codigo_restriccion} className="hover:bg-green-50/40">
                      <td className="px-6 py-5 font-bold text-gray-900 border-r border-dashed border-gray-200">{r.nombre_restriccion}</td>
                      <td className="px-6 py-5 border-r border-dashed border-gray-200">
                        <Badge variant="outline" className="font-mono border-green-200 text-green-700 bg-green-50">{r.valor_restriccion}</Badge>
                      </td>
                      <td className="px-6 py-5 text-sm text-gray-500 italic">{r.description || r.descripcion || 'Sin descripción'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card className="border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-gray-50 border-b">
              <div className="flex justify-between items-center">
                <CardTitle>Órdenes Provisionales (Venta Externa)</CardTitle>
                <Badge className="bg-green-600 text-white font-bold">{filteredOrders.length} Registros</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <FilterBar filters={filtersOrders} setFilters={setFiltersOrders} resps={respsOrders} />
              <div ref={syncRefs.ordenes.top} className="overflow-x-auto h-4 bg-gray-100/50 border-x rounded-t-lg">
                <div style={{ width: syncRefs.ordenes.width[0], height: '1px' }} />
              </div>
              <div ref={syncRefs.ordenes.bottom} className="overflow-x-auto border-x border-b rounded-b-lg max-h-[500px]">
                <table ref={syncRefs.ordenes.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Material / Descripción</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Cantidad</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Almacén</th>
                      <th className="px-4 py-3">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[13px]">
                    {filteredOrders.map((o, idx) => (
                      <tr key={idx} className="hover:bg-green-50/40">
                        <td className="px-4 py-4 font-bold text-gray-900 border-r border-dashed border-gray-200">{o.ORDENPREVISIONAL}</td>
                        <td className="px-4 py-4 border-r border-dashed border-gray-200">
                          <div className="font-mono text-xs text-green-700 font-bold">{o.MATERIAL}</div>
                          <div className="text-[11px] text-gray-500 truncate max-w-[300px] mx-auto uppercase">{o.NOMBRE}</div>
                        </td>
                        <td className="px-4 py-4 font-bold text-gray-800 border-r border-dashed border-gray-200">{o.CANTIDAD}</td>
                        <td className="px-4 py-4 text-gray-600 border-r border-dashed border-gray-200">{o.Almacen || o.ALMACEN}</td>
                        <td className="px-4 py-4 text-[11px] text-gray-400">{o.NombRespControlProd || o.RespCtrlProd || o.RESPCTRLPROD}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenesFert">
          <Card className="border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-gray-50 border-b">
              <div className="flex justify-between items-center">
                <CardTitle>Órdenes Fert (Productos Terminados)</CardTitle>
                <Badge className="bg-blue-600 text-white font-bold">{filteredFert.length} Registros</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <FilterBar filters={filtersFert} setFilters={setFiltersFert} resps={respsFert} />
              <div ref={syncRefs.fert.top} className="overflow-x-auto h-4 bg-gray-100/50 border-x rounded-t-lg">
                <div style={{ width: syncRefs.fert.width[0], height: '1px' }} />
              </div>
              <div ref={syncRefs.fert.bottom} className="overflow-x-auto border-x border-b rounded-b-lg max-h-[500px]">
                <table ref={syncRefs.fert.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden Fert</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Material / Descripción</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Cantidad</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Almacén</th>
                      <th className="px-4 py-3">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[13px]">
                    {filteredFert.map((o, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/40">
                        <td className="px-4 py-4 font-bold text-gray-900 border-r border-dashed border-gray-200">{o.Orden || o.ORDENFERT}</td>
                        <td className="px-4 py-4 border-r border-dashed border-gray-200">
                          <div className="font-mono text-xs text-blue-700 font-bold">{o.CodMaterial || o.MATERIAL}</div>
                          <div className="text-[11px] text-gray-500 truncate max-w-[300px] mx-auto uppercase">{o.Descripcion || o.NOMBRE}</div>
                        </td>
                        <td className="px-4 py-4 font-bold text-gray-800 border-r border-dashed border-gray-200">{o.Cantidad || o.CANTIDAD}</td>
                        <td className="px-4 py-4 text-gray-600 border-r border-dashed border-gray-200">{o.Almacen || o.ALMACEN}</td>
                        <td className="px-4 py-4 text-[11px] text-gray-400">{o.NombRespControlProd || o.RespCtrlProd || o.RESPCTRLPROD}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-gray-50 border-b">
              <div className="flex justify-between items-center">
                <CardTitle>Tiempos de Ensamblado (Catálogo Técnico)</CardTitle>
                <Badge className="bg-purple-600 text-white font-bold">{filteredTiempos.length} Registros</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <FilterBar filters={filtersTiempos} setFilters={setFiltersTiempos} resps={respsTiempos} />
              <div ref={syncRefs.tiempos.top} className="overflow-x-auto h-4 bg-gray-100/50 border-x rounded-t-lg">
                <div style={{ width: syncRefs.tiempos.width[0], height: '1px' }} />
              </div>
              <div ref={syncRefs.tiempos.bottom} className="overflow-x-auto border-x border-b rounded-b-lg max-h-[500px]">
                <table ref={syncRefs.tiempos.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Centro</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Línea / Puesto</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">T. Estándar (min)</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Stock Actual</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Stock Seg.</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Clase</th>
                      <th className="px-4 py-3">Resp. Prod.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[13px]">
                    {filteredTiempos.map((t, idx) => (
                      <tr key={idx} className="hover:bg-purple-50/30">
                        <td className="px-4 py-4 font-bold text-gray-900 border-r border-dashed border-gray-200 font-mono">{t.CodMaterial}</td>
                        <td className="px-4 py-4 text-gray-600 border-r border-dashed border-gray-200">{t.Centro}</td>
                        <td className="px-4 py-4 border-r border-dashed border-gray-200">
                          <div className="text-[11px] font-bold text-gray-700">{t.PuestoTrabajoLinea || t.Linea}</div>
                          <div className="text-[9px] text-gray-400 uppercase">{t.PuestoTrabajo}</div>
                        </td>
                        <td className="px-4 py-4 font-bold text-purple-700 border-r border-dashed border-gray-200">
                          {t.Tiempo_Min ? Number(t.Tiempo_Min).toFixed(4) : '0.0000'}
                        </td>
                        <td className="px-4 py-4 font-mono text-gray-600 border-r border-dashed border-gray-200">{t.StockActual || 0}</td>
                        <td className="px-4 py-4 font-mono text-gray-400 border-r border-dashed border-gray-200">{t.StockSeguridad || 0}</td>
                        <td className="px-4 py-4 font-bold text-teal-600 border-r border-dashed border-gray-200">{t.ClaseAprovisionam || '—'}</td>
                        <td className="px-4 py-4 text-[10px] text-gray-400">{t.NombRespControlProd || t.RespCtrlProd}</td>
                      </tr>
                    ))}
                    {filteredTiempos.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-20 text-gray-400 italic">No se encontraron datos técnicos para los filtros seleccionados</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
