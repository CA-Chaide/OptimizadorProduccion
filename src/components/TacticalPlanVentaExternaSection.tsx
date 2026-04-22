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
 * Especializado para el área de Venta Externa.
 * Implementa segmentación independiente por Centro (1000/2000) basada en restricciones.
 * Sin buscadores manuales: Filtrado automático por RESPCTRLPROD, ALMACEN y SECTOR.
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
  const scrollC1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollC2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollFert = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

  // Hydration safety
  useEffect(() => {
    setMounted(true);
  }, []);

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
      // 1. Cargar Órdenes de forma masiva
      const [provRes, fertRes] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getOrdenesFert(1, 20000)
      ]);
      
      // Manejar estructura { data: [], length } o array directo
      const provData = provRes.data?.data || provRes.data || [];
      const fertData = fertRes.data?.data || fertRes.data || [];
      
      setOrders(Array.isArray(provData) ? provData : []);
      setOrdersFert(Array.isArray(fertData) ? fertData : []);

      // 2. Cargar Tiempos de Ensamblado por cada grupo identificado
      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
        const actualData = res.data?.data || res.data || [];
        if (Array.isArray(actualData)) {
          allTiempos.push(...actualData);
        }
      }
      setTiemposEnsamblado(allTiempos);
      
      inspector.captureVariable('dataLoaded', {
        provisionales: provData.length,
        fert: fertData.length,
        tiempos: allTiempos.length
      });
    } catch (error) {
      console.error('Error cargando datos operativos:', error);
      addNotification('error', 'Error al cargar datos desde la API operativa');
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

  // Lógica de Filtrado por Restricciones
  const getFilteredData = (data: any[], centro: string) => {
    if (!data || data.length === 0) return [];
    
    const group = grupos.find(g => String(g.centro) === centro);
    if (!group) return data.filter(o => String(o.Centro || o.CENTRO || o.centro || '').trim() === centro);
    
    const groupRest = restricciones.filter(r => r.codigo_grupo === group.codigo_grupo);
    
    const respCodes = groupRest
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almCodes = groupRest
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .map(r => r.valor_restriccion.trim())
      .filter(v => v !== '');

    return data.filter(o => {
      // Validar Centro
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;

      // Validar Responsable
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = respCodes.length === 0 || respCodes.some(code => itemResp.includes(code));

      // Validar Almacén
      const itemAlm = String(o.Almacen || o.ALMACEN || o.Almacen || '').trim();
      const matchAlm = almCodes.length === 0 || almCodes.includes(itemAlm);

      return matchResp && matchAlm;
    });
  };

  const ordenesC1000 = useMemo(() => getFilteredData(ordenes, '1000'), [ordenes, grupos, restricciones]);
  const ordenesC2000 = useMemo(() => getFilteredData(ordenes, '2000'), [ordenes, grupos, restricciones]);

  const fertFiltradas = useMemo(() => {
    if (!ordenesFert || ordenesFert.length === 0) return [];
    const allResps = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return ordenesFert.filter(o => {
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || '').trim();
      return allResps.length === 0 || allResps.includes(itemResp);
    });
  }, [ordenesFert, restricciones]);

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
    if (!mounted) return;
    
    const cleaners = [
      setupScroll(scrollC1000),
      setupScroll(scrollC2000),
      setupScroll(scrollFert),
      setupScroll(scrollTiempos)
    ];
    
    const updateWidths = () => {
      if (scrollC1000.table.current) scrollC1000.width[1](scrollC1000.table.current.offsetWidth);
      if (scrollC2000.table.current) scrollC2000.width[1](scrollC2000.table.current.offsetWidth);
      if (scrollFert.table.current) scrollFert.width[1](scrollFert.table.current.offsetWidth);
      if (scrollTiempos.table.current) scrollTiempos.width[1](scrollTiempos.table.current.offsetWidth);
    };
    
    setTimeout(updateWidths, 300);
    return () => cleaners.forEach(c => c?.());
  }, [activeTab, ordenesC1000, ordenesC2000, fertFiltradas, tiemposEnsamblado, mounted]);

  if (!mounted || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-green-600" />
        <p className="text-gray-500 font-black uppercase tracking-widest animate-pulse">Sincronizando Venta Externa...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-4 mb-4">
        <div className="bg-green-600 p-3 rounded-2xl shadow-xl shadow-green-100">
          <ShoppingCart className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Planificación Táctica Venta Externa</h2>
          <p className="text-sm text-gray-400 font-medium">Segmentación Estratégica por Restricciones de Grupo</p>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-12 bg-gray-100/50 border rounded-xl p-1 mb-8">
          <TabsTrigger value="grupos" className="rounded-lg font-bold uppercase text-[10px]">Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="rounded-lg font-bold uppercase text-[10px]">Restricciones</TabsTrigger>
          <TabsTrigger value="ordenes" className="rounded-lg font-bold uppercase text-[10px]">Provisionales</TabsTrigger>
          <TabsTrigger value="ordenesFert" className="rounded-lg font-bold uppercase text-[10px]">Órdenes Fert</TabsTrigger>
          <TabsTrigger value="tiempos" className="rounded-lg font-bold uppercase text-[10px]">Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="p-6 border-2 border-dashed rounded-3xl bg-gray-50/30 hover:bg-white transition-all shadow-sm">
                <Badge className="bg-green-600 mb-3">Planta {g.centro}</Badge>
                <h4 className="font-black text-gray-800 uppercase text-lg leading-tight">{g.nombre_grupo}</h4>
                <p className="text-xs text-gray-400 mt-2 font-mono">CÓDIGO DE GRUPO: {g.codigo_grupo}</p>
              </Card>
            ))}
            {grupos.length === 0 && <div className="col-span-2 text-center py-10 text-gray-400 font-bold uppercase">No se encontraron grupos de Venta Externa</div>}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-3xl overflow-hidden border-none shadow-xl shadow-gray-100">
            <div className="overflow-x-auto border rounded-3xl">
              <table className="w-full text-center border-collapse">
                <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400">
                  <tr>
                    <th className="px-6 py-5 border-r border-dashed border-gray-200">Parámetro Técnico</th>
                    <th className="px-6 py-5 border-r border-dashed border-gray-200">Valor Asignado</th>
                    <th className="px-6 py-5">Descripción Operativa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px]">
                  {restricciones.map(r => (
                    <tr key={r.codigo_restriccion} className="hover:bg-green-50/20 transition-colors">
                      <td className="px-6 py-4 font-black text-gray-700 border-r border-dashed border-gray-200 uppercase">{r.nombre_restriccion}</td>
                      <td className="px-6 py-4 border-r border-dashed border-gray-200">
                        <Badge variant="outline" className="font-mono text-green-700 border-green-200 bg-green-50/50">{r.valor_restriccion}</Badge>
                      </td>
                      <td className="px-6 py-4 text-gray-400 italic">{r.descripcion || '—'}</td>
                    </tr>
                  ))}
                  {restricciones.length === 0 && <tr><td colSpan={3} className="py-10 text-gray-400 font-bold uppercase">No hay restricciones configuradas</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-12">
          {/* BLOQUE C1000 */}
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-green-700 flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
              Centro 1000 - Órdenes Segmentadas ({ordenesC1000.length})
            </h3>
            <Card className="rounded-3xl overflow-hidden shadow-sm">
              <div ref={scrollC1000.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: scrollC1000.width[0], height: '1px' }} /></div>
              <div ref={scrollC1000.bottom} className="overflow-x-auto border-t max-h-[400px]">
                <table ref={scrollC1000.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] uppercase font-black text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed">Orden</th>
                      <th className="px-4 py-3 border-r border-dashed">Material</th>
                      <th className="px-4 py-3 border-r border-dashed">Descripción</th>
                      <th className="px-4 py-3 border-r border-dashed">Cantidad</th>
                      <th className="px-4 py-3">Almacén</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {ordenesC1000.map((o, i) => (
                      <tr key={i} className="hover:bg-green-50/30">
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN}</td>
                        <td className="px-4 py-3 font-mono text-green-600 font-black border-r border-dashed border-gray-100">{o.MATERIAL || o.CodMaterial}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-100 text-left truncate max-w-xs">{o.NOMBRE || o.Descripcion}</td>
                        <td className="px-4 py-3 font-black border-r border-dashed border-gray-100">{o.CANTIDAD}</td>
                        <td className="px-4 py-3 font-bold text-gray-400">{o.Almacen || o.ALMACEN}</td>
                      </tr>
                    ))}
                    {ordenesC1000.length === 0 && <tr><td colSpan={5} className="py-10 text-gray-300 font-bold uppercase italic">Sin órdenes filtradas para C1000</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* BLOQUE C2000 */}
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-blue-700 flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              Centro 2000 - Órdenes Segmentadas ({ordenesC2000.length})
            </h3>
            <Card className="rounded-3xl overflow-hidden shadow-sm">
              <div ref={scrollC2000.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: scrollC2000.width[0], height: '1px' }} /></div>
              <div ref={scrollC2000.bottom} className="overflow-x-auto border-t max-h-[400px]">
                <table ref={scrollC2000.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] uppercase font-black text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed">Orden</th>
                      <th className="px-4 py-3 border-r border-dashed">Material</th>
                      <th className="px-4 py-3 border-r border-dashed">Descripción</th>
                      <th className="px-4 py-3 border-r border-dashed">Cantidad</th>
                      <th className="px-4 py-3">Almacén</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {ordenesC2000.map((o, i) => (
                      <tr key={i} className="hover:bg-blue-50/30">
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN}</td>
                        <td className="px-4 py-3 font-mono text-blue-600 font-black border-r border-dashed border-gray-100">{o.MATERIAL || o.CodMaterial}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-100 text-left truncate max-w-xs">{o.NOMBRE || o.Descripcion}</td>
                        <td className="px-4 py-3 font-black border-r border-dashed border-gray-100">{o.CANTIDAD}</td>
                        <td className="px-4 py-3 font-bold text-gray-400">{o.Almacen || o.ALMACEN}</td>
                      </tr>
                    ))}
                    {ordenesC2000.length === 0 && <tr><td colSpan={5} className="py-10 text-gray-300 font-bold uppercase italic">Sin órdenes filtradas para C2000</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* CONTENIDO DE FERT */}
        <TabsContent value="ordenesFert">
          <Card className="rounded-3xl overflow-hidden border-none shadow-sm">
            <div ref={scrollFert.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-3xl"><div style={{ width: scrollFert.width[0], height: '1px' }} /></div>
            <div ref={scrollFert.bottom} className="overflow-x-auto border rounded-b-3xl max-h-[600px]">
              <table ref={scrollFert.table} className="w-full text-center border-collapse">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] uppercase font-black text-gray-500">
                  <tr>
                    <th className="px-4 py-3 border-r border-dashed">Orden Fert</th>
                    <th className="px-4 py-3 border-r border-dashed">Material</th>
                    <th className="px-4 py-3 border-r border-dashed">Descripción</th>
                    <th className="px-4 py-3 border-r border-dashed">Cantidad</th>
                    <th className="px-4 py-3">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {fertFiltradas.map((o, i) => (
                    <tr key={i} className="hover:bg-indigo-50/30">
                      <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{o.Orden || o.ORDENFERT}</td>
                      <td className="px-4 py-3 font-mono text-indigo-600 font-black border-r border-dashed border-gray-100">{o.CodMaterial || o.MATERIAL}</td>
                      <td className="px-4 py-3 border-r border-dashed border-gray-100 text-left truncate max-w-xs">{o.Descripcion || o.NOMBRE}</td>
                      <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-100">{o.Cantidad || o.CANTIDAD}</td>
                      <td className="px-4 py-3 font-bold text-gray-400 uppercase">{o.NombRespControlProd || o.RespCtrlProd || '—'}</td>
                    </tr>
                  ))}
                  {fertFiltradas.length === 0 && <tr><td colSpan={5} className="py-10 text-gray-400 font-bold uppercase">No se encontraron órdenes FERT filtradas</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* CONTENIDO DE TIEMPOS */}
        <TabsContent value="tiempos">
          <Card className="rounded-3xl overflow-hidden border-none shadow-sm">
            <div ref={scrollTiempos.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-3xl"><div style={{ width: scrollTiempos.width[0], height: '1px' }} /></div>
            <div ref={scrollTiempos.bottom} className="overflow-x-auto border rounded-b-3xl max-h-[600px]">
              <table ref={scrollTiempos.table} className="w-full text-center border-collapse">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] uppercase font-black text-gray-500">
                  <tr>
                    <th className="px-4 py-3 border-r border-dashed">Material</th>
                    <th className="px-4 py-3 border-r border-dashed">Línea Técnica</th>
                    <th className="px-4 py-3 border-r border-dashed">T. Estándar (Min)</th>
                    <th className="px-4 py-3 border-r border-dashed">Stock Actual</th>
                    <th className="px-4 py-3 border-r border-dashed">Seguridad</th>
                    <th className="px-4 py-3 border-r border-dashed">Aprov.</th>
                    <th className="px-4 py-3">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {tiemposEnsamblado.map((t, i) => (
                    <tr key={i} className="hover:bg-purple-50/20">
                      <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-100">{t.CodMaterial}</td>
                      <td className="px-4 py-3 border-r border-dashed border-gray-100">
                        <div className="font-bold text-gray-700">{t.PuestoTrabajoLinea || t.Linea}</div>
                        <div className="text-[9px] text-gray-400 font-mono tracking-tighter uppercase">{t.PuestoTrabajo || 'ESTACIÓN'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-purple-700 font-black border-r border-dashed border-gray-100">
                        {t.Tiempo_Min ? Number(t.Tiempo_Min).toFixed(4) : '0.0000'}
                      </td>
                      <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{t.StockActual || 0}</td>
                      <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{t.StockSeguridad || 0}</td>
                      <td className="px-4 py-3 font-black text-green-600 border-r border-dashed border-gray-100">{t.ClaseAprovisionam || '—'}</td>
                      <td className="px-4 py-3 font-bold text-gray-400 uppercase text-[9px]">{t.NombRespControlProd || t.RespCtrlProd || '—'}</td>
                    </tr>
                  ))}
                  {tiemposEnsamblado.length === 0 && <tr><td colSpan={7} className="py-10 text-gray-400 font-bold uppercase">No se encontraron tiempos de ensamblado</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
