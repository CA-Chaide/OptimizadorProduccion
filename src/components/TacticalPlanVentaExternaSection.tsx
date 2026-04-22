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
 * Visualización técnica con contenido centrado, bordes dashed y doble scroll sincronizado.
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

  // Refs para sincronización de scroll
  const scrollC1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollC2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollFert = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

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
      // 1. Cargar Órdenes Provisionales y Fert de forma masiva
      const [provRes, fertRes] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getOrdenesFert(1, 20000)
      ]);
      
      setOrders(provRes.data || []);
      setOrdersFert(fertRes.data || []);

      // 2. Cargar Tiempos de Ensamblado por cada grupo identificado
      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
        // Manejar estructura { data: [], length }
        const dataArray = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        if (dataArray.length > 0) allTiempos.push(...dataArray);
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

  // Lógica de Filtrado Estricto por Restricciones
  const getFilteredData = (data: any[], centro: string) => {
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

    const sectorCodes = groupRest
      .filter(r => r.nombre_restriccion === 'SECTOR')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return data.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;

      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.NombRespControlProd || '').trim();
      const itemAlm = String(o.Almacen || o.ALMACEN || '').trim();
      const itemSector = String(o.Sector || o.SECTOR || '').trim();

      const matchResp = respCodes.length === 0 || respCodes.some(code => itemResp.includes(code));
      const matchAlm = almCodes.length === 0 || almCodes.includes(itemAlm);
      const matchSector = sectorCodes.length === 0 || sectorCodes.includes(itemSector);

      return matchResp && matchAlm && matchSector;
    });
  };

  const ordenesC1000 = useMemo(() => getFilteredData(ordenes, '1000'), [ordenes, grupos, restricciones]);
  const ordenesC2000 = useMemo(() => getFilteredData(ordenes, '2000'), [ordenes, grupos, restricciones]);

  const fertFiltradas = useMemo(() => {
    // Para FERT, consolidamos los códigos de responsable de ambos grupos de Venta Externa
    const allResps = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()));

    return ordenesFert.filter(o => {
      const itemResp = String(o.RESPCTRLPROD || o.RespCtrlProd || '').trim();
      return allResps.length === 0 || allResps.includes(itemResp);
    });
  }, [ordenesFert, restricciones]);

  // Sincronización de scroll genérica
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
      setupScroll(scrollC1000),
      setupScroll(scrollC2000),
      setupScroll(scrollFert),
      setupScroll(scrollTiempos)
    ];
    
    // Actualizar anchos para el scroll superior
    const update = () => {
      if (scrollC1000.table.current) scrollC1000.width[1](scrollC1000.table.current.offsetWidth);
      if (scrollC2000.table.current) scrollC2000.width[1](scrollC2000.table.current.offsetWidth);
      if (scrollFert.table.current) scrollFert.width[1](scrollFert.table.current.offsetWidth);
      if (scrollTiempos.table.current) scrollTiempos.width[1](scrollTiempos.table.current.offsetWidth);
    };
    
    setTimeout(update, 100);
    return () => cleaners.forEach(c => c?.());
  }, [activeTab, ordenesC1000, ordenesC2000, fertFiltradas, tiemposEnsamblado]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-green-600" />
        <p className="text-gray-500 font-bold uppercase tracking-widest">Sincronizando Venta Externa...</p>
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
          <p className="text-sm text-gray-400 font-medium">Segmentación Estratégica C1000 / C2000</p>
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
                      <td className="px-6 py-4 text-gray-400 italic">{r.descripcion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-12">
          {/* BLOQUE C1000 - QUITO */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-sm font-black uppercase text-green-700 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
                Centro 1000 - Órdenes Filtradas
              </h3>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-mono">{ordenesC1000.length} REG</Badge>
            </div>
            <Card className="rounded-3xl overflow-hidden border-none shadow-sm">
              <div ref={scrollC1000.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-3xl"><div style={{ width: scrollC1000.width[0], height: '1px' }} /></div>
              <div ref={scrollC1000.bottom} className="overflow-x-auto border rounded-b-3xl max-h-[400px]">
                <table ref={scrollC1000.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-black text-gray-500 z-10">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Descripción</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Cantidad</th>
                      <th className="px-4 py-3">Almacén</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px]">
                    {ordenesC1000.map((o, i) => (
                      <tr key={i} className="hover:bg-green-50/30 transition-colors">
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL}</td>
                        <td className="px-4 py-3 font-mono text-green-600 font-black border-r border-dashed border-gray-100">{o.MATERIAL}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-100 text-left max-w-xs truncate">{o.NOMBRE}</td>
                        <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-100">{o.CANTIDAD}</td>
                        <td className="px-4 py-3 font-bold text-gray-400">{o.Almacen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* BLOQUE C2000 - GUAYAQUIL */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-sm font-black uppercase text-blue-700 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                Centro 2000 - Órdenes Filtradas
              </h3>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-mono">{ordenesC2000.length} REG</Badge>
            </div>
            <Card className="rounded-3xl overflow-hidden border-none shadow-sm">
              <div ref={scrollC2000.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-3xl"><div style={{ width: scrollC2000.width[0], height: '1px' }} /></div>
              <div ref={scrollC2000.bottom} className="overflow-x-auto border rounded-b-3xl max-h-[400px]">
                <table ref={scrollC2000.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-black text-gray-500 z-10">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Descripción</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Cantidad</th>
                      <th className="px-4 py-3">Almacén</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px]">
                    {ordenesC2000.map((o, i) => (
                      <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL}</td>
                        <td className="px-4 py-3 font-mono text-blue-600 font-black border-r border-dashed border-gray-100">{o.MATERIAL}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-100 text-left max-w-xs truncate">{o.NOMBRE}</td>
                        <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-100">{o.CANTIDAD}</td>
                        <td className="px-4 py-3 font-bold text-gray-400">{o.Almacen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ordenesFert">
          <Card className="rounded-3xl overflow-hidden border-none shadow-sm">
            <div ref={scrollFert.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-3xl"><div style={{ width: scrollFert.width[0], height: '1px' }} /></div>
            <div ref={scrollFert.bottom} className="overflow-x-auto border rounded-b-3xl max-h-[600px]">
              <table ref={scrollFert.table} className="w-full text-center border-collapse">
                <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-black text-gray-500 z-10">
                  <tr>
                    <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden Fert</th>
                    <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                    <th className="px-4 py-3 border-r border-dashed border-gray-200">Descripción</th>
                    <th className="px-4 py-3 border-r border-dashed border-gray-200">Cantidad</th>
                    <th className="px-4 py-3">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {fertFiltradas.map((o, i) => (
                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{o.Orden || o.ORDENFERT}</td>
                      <td className="px-4 py-3 font-mono text-indigo-600 font-black border-r border-dashed border-gray-100">{o.CodMaterial || o.MATERIAL}</td>
                      <td className="px-4 py-3 border-r border-dashed border-gray-100 text-left max-w-xs truncate">{o.Descripcion || o.NOMBRE}</td>
                      <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-100">{o.Cantidad || o.CANTIDAD}</td>
                      <td className="px-4 py-3 font-bold text-gray-400 uppercase">{o.NombRespControlProd || o.RespCtrlProd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="rounded-3xl overflow-hidden border-none shadow-sm">
            <div ref={scrollTiempos.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-3xl"><div style={{ width: scrollTiempos.width[0], height: '1px' }} /></div>
            <div ref={scrollTiempos.bottom} className="overflow-x-auto border rounded-b-3xl max-h-[600px]">
              <table ref={scrollTiempos.table} className="w-full text-center border-collapse">
                <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-black text-gray-500 z-10">
                  <tr>
                    <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                    <th className="px-4 py-3 border-r border-dashed border-gray-200">Línea Técnica</th>
                    <th className="px-4 py-3 border-r border-dashed border-gray-200">T. Estándar (Min)</th>
                    <th className="px-4 py-3 border-r border-dashed border-gray-200">Stock Actual</th>
                    <th className="px-4 py-3 border-r border-dashed border-gray-200">Seguridad</th>
                    <th className="px-4 py-3 border-r border-dashed border-gray-200">Aprov.</th>
                    <th className="px-4 py-3">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {tiemposEnsamblado.map((t, i) => (
                    <tr key={i} className="hover:bg-purple-50/20 transition-colors">
                      <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-100">{t.CodMaterial}</td>
                      <td className="px-4 py-3 border-r border-dashed border-gray-100">
                        <div className="font-bold text-gray-700">{t.PuestoTrabajoLinea || t.Linea}</div>
                        <div className="text-[9px] text-gray-400 font-mono tracking-tighter uppercase">{t.PuestoTrabajo}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-purple-700 font-black border-r border-dashed border-gray-100">
                        {t.Tiempo_Min ? Number(t.Tiempo_Min).toFixed(4) : '0.0000'}
                      </td>
                      <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{t.StockActual || 0}</td>
                      <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{t.StockSeguridad || 0}</td>
                      <td className="px-4 py-3 font-black text-green-600 border-r border-dashed border-gray-100">{t.ClaseAprovisionam}</td>
                      <td className="px-4 py-3 font-bold text-gray-400 uppercase text-[9px]">{t.NombRespControlProd || t.RespCtrlProd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
