'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, Clock, CheckCircle2 } from 'lucide-react';
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
 * Segmentación Inteligente: Órdenes Provisionales, Órdenes Fert y Tiempos 
 * se muestran filtradas por centro (1000/2000) de forma independiente.
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

  // Refs para sincronización de scroll - Provisionales
  const scrollProv1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollProv2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  
  // Refs para sincronización de scroll - Fert
  const scrollFert1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollFert2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

  // Refs para sincronización de scroll - Tiempos
  const scrollTiempos1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

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
      const [provRes, fertRes] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getOrdenesFert(1, 20000)
      ]);
      
      const provData = provRes.data?.data || provRes.data || [];
      const fertData = fertRes.data?.data || fertRes.data || [];
      
      setOrders(Array.isArray(provData) ? provData : []);
      setOrdersFert(Array.isArray(fertData) ? fertData : []);

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
    } catch (error) {
      console.error('Error cargando datos operativos:', error);
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

  // Lógica de Filtrado por Restricciones de Grupo
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
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;

      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = respCodes.length === 0 || respCodes.some(code => itemResp.includes(code));

      const itemAlm = String(o.Almacen || o.ALMACEN || o.Almacen || '').trim();
      const matchAlm = almCodes.length === 0 || almCodes.includes(itemAlm);

      return matchResp && matchAlm;
    });
  };

  // Datos Segmentados - Provisionales
  const provC1000 = useMemo(() => getFilteredData(ordenes, '1000'), [ordenes, grupos, restricciones]);
  const provC2000 = useMemo(() => getFilteredData(ordenes, '2000'), [ordenes, grupos, restricciones]);

  // Datos Segmentados - Fert
  const fertC1000 = useMemo(() => getFilteredData(ordenesFert, '1000'), [ordenesFert, grupos, restricciones]);
  const fertC2000 = useMemo(() => getFilteredData(ordenesFert, '2000'), [ordenesFert, grupos, restricciones]);

  // Datos Segmentados - Tiempos
  const tiemposC1000 = useMemo(() => getFilteredData(tiemposEnsamblado, '1000'), [tiemposEnsamblado, grupos, restricciones]);
  const tiemposC2000 = useMemo(() => getFilteredData(tiemposEnsamblado, '2000'), [tiemposEnsamblado, grupos, restricciones]);

  // Función de Sincronización de Scroll
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
      setupScroll(scrollProv1000), setupScroll(scrollProv2000),
      setupScroll(scrollFert1000), setupScroll(scrollFert2000),
      setupScroll(scrollTiempos1000), setupScroll(scrollTiempos2000)
    ];
    const updateWidths = () => {
      [scrollProv1000, scrollProv2000, scrollFert1000, scrollFert2000, scrollTiempos1000, scrollTiempos2000].forEach(s => {
        if (s.table.current) s.width[1](s.table.current.offsetWidth);
      });
    };
    setTimeout(updateWidths, 400);
    return () => cleaners.forEach(c => c?.());
  }, [activeTab, ordenes, ordenesFert, tiemposEnsamblado, mounted]);

  if (!mounted || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-green-600" />
        <p className="text-gray-500 font-black uppercase tracking-widest animate-pulse">Sincronizando Segmentación Venta Externa...</p>
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
          <p className="text-sm text-gray-400 font-medium">Segmentación Inteligente Quito (1000) / Guayaquil (2000)</p>
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
              <Card key={g.codigo_grupo} className="p-6 border-2 border-dashed rounded-3xl bg-gray-50/30">
                <Badge className="bg-green-600 mb-3">Planta {g.centro}</Badge>
                <h4 className="font-black text-gray-800 uppercase text-lg leading-tight">{g.nombre_grupo}</h4>
                <p className="text-xs text-gray-400 mt-2 font-mono">ID: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto border rounded-3xl">
              <table className="w-full text-center border-collapse">
                <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400">
                  <tr>
                    <th className="px-6 py-5 border-r border-dashed border-gray-200">Parámetro</th>
                    <th className="px-6 py-5 border-r border-dashed border-gray-200">Valor</th>
                    <th className="px-6 py-5">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px]">
                  {restricciones.map(r => (
                    <tr key={r.codigo_restriccion} className="hover:bg-green-50/20 transition-colors">
                      <td className="px-6 py-4 font-black text-gray-700 border-r border-dashed border-gray-200 uppercase">{r.nombre_restriccion}</td>
                      <td className="px-6 py-4 border-r border-dashed border-gray-200">
                        <Badge variant="outline" className="font-mono text-green-700 border-green-200">{r.valor_restriccion}</Badge>
                      </td>
                      <td className="px-6 py-4 text-gray-400 italic">{r.descripcion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Tab Provisionales Segmentado */}
        <TabsContent value="ordenes" className="space-y-12">
          {/* C1000 */}
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-green-700 px-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" /> Quito - Planta 1000 ({provC1000.length})
            </h3>
            <Card className="rounded-3xl overflow-hidden shadow-sm">
              <div ref={scrollProv1000.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: scrollProv1000.width[0], height: '1px' }} /></div>
              <div ref={scrollProv1000.bottom} className="overflow-x-auto border-t max-h-[400px]">
                <table ref={scrollProv1000.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] uppercase font-black text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed">Orden</th>
                      <th className="px-4 py-3 border-r border-dashed">Material</th>
                      <th className="px-4 py-3 border-r border-dashed">Cantidad</th>
                      <th className="px-4 py-3">Almacén</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {provC1000.map((o, i) => (
                      <tr key={i} className="hover:bg-green-50/30">
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL}</td>
                        <td className="px-4 py-3 font-mono text-green-600 font-black border-r border-dashed border-gray-100">{o.MATERIAL}</td>
                        <td className="px-4 py-3 font-black border-r border-dashed border-gray-100">{o.CANTIDAD}</td>
                        <td className="px-4 py-3 font-bold text-gray-400">{o.Almacen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          {/* C2000 */}
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-blue-700 px-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" /> Guayaquil - Planta 2000 ({provC2000.length})
            </h3>
            <Card className="rounded-3xl overflow-hidden shadow-sm">
              <div ref={scrollProv2000.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: scrollProv2000.width[0], height: '1px' }} /></div>
              <div ref={scrollProv2000.bottom} className="overflow-x-auto border-t max-h-[400px]">
                <table ref={scrollProv2000.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] uppercase font-black text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed">Orden</th>
                      <th className="px-4 py-3 border-r border-dashed">Material</th>
                      <th className="px-4 py-3 border-r border-dashed">Cantidad</th>
                      <th className="px-4 py-3">Almacén</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {provC2000.map((o, i) => (
                      <tr key={i} className="hover:bg-blue-50/30">
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL}</td>
                        <td className="px-4 py-3 font-mono text-blue-600 font-black border-r border-dashed border-gray-100">{o.MATERIAL}</td>
                        <td className="px-4 py-3 font-black border-r border-dashed border-gray-100">{o.CANTIDAD}</td>
                        <td className="px-4 py-3 font-bold text-gray-400">{o.Almacen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Tab Fert Segmentado */}
        <TabsContent value="ordenesFert" className="space-y-12">
          {/* C1000 */}
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-green-700 px-2 flex items-center gap-2">
               <CheckCircle2 className="w-4 h-4" /> Quito - Fert 1000 ({fertC1000.length})
            </h3>
            <Card className="rounded-3xl overflow-hidden shadow-sm">
              <div ref={scrollFert1000.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: scrollFert1000.width[0], height: '1px' }} /></div>
              <div ref={scrollFert1000.bottom} className="overflow-x-auto border-t max-h-[400px]">
                <table ref={scrollFert1000.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] uppercase font-black text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed">Orden Fert</th>
                      <th className="px-4 py-3 border-r border-dashed">Material</th>
                      <th className="px-4 py-3 border-r border-dashed">Descripción</th>
                      <th className="px-4 py-3">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {fertC1000.map((o, i) => (
                      <tr key={i} className="hover:bg-green-50/30">
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{o.ORDENFERT || o.Orden}</td>
                        <td className="px-4 py-3 font-mono text-green-600 font-black border-r border-dashed border-gray-100">{o.MATERIAL || o.CodMaterial}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-100 truncate max-w-xs text-left">{o.NOMBRE || o.Descripcion}</td>
                        <td className="px-4 py-3 font-black text-gray-800">{o.CANTIDAD || o.Cantidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          {/* C2000 */}
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-blue-700 px-2 flex items-center gap-2">
               <CheckCircle2 className="w-4 h-4" /> Guayaquil - Fert 2000 ({fertC2000.length})
            </h3>
            <Card className="rounded-3xl overflow-hidden shadow-sm">
              <div ref={scrollFert2000.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: scrollFert2000.width[0], height: '1px' }} /></div>
              <div ref={scrollFert2000.bottom} className="overflow-x-auto border-t max-h-[400px]">
                <table ref={scrollFert2000.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] uppercase font-black text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed">Orden Fert</th>
                      <th className="px-4 py-3 border-r border-dashed">Material</th>
                      <th className="px-4 py-3 border-r border-dashed">Descripción</th>
                      <th className="px-4 py-3">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {fertC2000.map((o, i) => (
                      <tr key={i} className="hover:bg-blue-50/30">
                        <td className="px-4 py-3 font-bold border-r border-dashed border-gray-100">{o.ORDENFERT || o.Orden}</td>
                        <td className="px-4 py-3 font-mono text-blue-600 font-black border-r border-dashed border-gray-100">{o.MATERIAL || o.CodMaterial}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-100 truncate max-w-xs text-left">{o.NOMBRE || o.Descripcion}</td>
                        <td className="px-4 py-3 font-black text-gray-800">{o.CANTIDAD || o.Cantidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Tab Tiempos Segmentado */}
        <TabsContent value="tiempos" className="space-y-12">
          {/* C1000 */}
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-green-700 px-2 flex items-center gap-2">
               <Clock className="w-4 h-4" /> Quito - Catálogo Técnico 1000 ({tiemposC1000.length})
            </h3>
            <Card className="rounded-3xl overflow-hidden shadow-sm">
              <div ref={scrollTiempos1000.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: scrollTiempos1000.width[0], height: '1px' }} /></div>
              <div ref={scrollTiempos1000.bottom} className="overflow-x-auto border-t max-h-[400px]">
                <table ref={scrollTiempos1000.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] uppercase font-black text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed">Material</th>
                      <th className="px-4 py-3 border-r border-dashed">Línea Técnica</th>
                      <th className="px-4 py-3 border-r border-dashed">T. Estándar (Min)</th>
                      <th className="px-4 py-3">Stock / Seg.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {tiemposC1000.map((t, i) => (
                      <tr key={i} className="hover:bg-green-50/30">
                        <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-100">{t.CodMaterial}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-100">
                          <div className="font-bold text-gray-700">{t.PuestoTrabajoLinea || t.Linea}</div>
                          <div className="text-[9px] text-gray-400 font-mono">{t.PuestoTrabajo}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-green-700 font-black border-r border-dashed border-gray-100">{t.Tiempo_Min?.toFixed(4)}</td>
                        <td className="px-4 py-3 font-bold text-gray-400">{t.StockActual} / {t.StockSeguridad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          {/* C2000 */}
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-blue-700 px-2 flex items-center gap-2">
               <Clock className="w-4 h-4" /> Guayaquil - Catálogo Técnico 2000 ({tiemposC2000.length})
            </h3>
            <Card className="rounded-3xl overflow-hidden shadow-sm">
              <div ref={scrollTiempos2000.top} className="overflow-x-auto h-3 bg-gray-50"><div style={{ width: scrollTiempos2000.width[0], height: '1px' }} /></div>
              <div ref={scrollTiempos2000.bottom} className="overflow-x-auto border-t max-h-[400px]">
                <table ref={scrollTiempos2000.table} className="w-full text-center border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] uppercase font-black text-gray-500">
                    <tr>
                      <th className="px-4 py-3 border-r border-dashed">Material</th>
                      <th className="px-4 py-3 border-r border-dashed">Línea Técnica</th>
                      <th className="px-4 py-3 border-r border-dashed">T. Estándar (Min)</th>
                      <th className="px-4 py-3">Stock / Seg.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {tiemposC2000.map((t, i) => (
                      <tr key={i} className="hover:bg-blue-50/30">
                        <td className="px-4 py-3 font-black text-gray-800 border-r border-dashed border-gray-100">{t.CodMaterial}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-100">
                          <div className="font-bold text-gray-700">{t.PuestoTrabajoLinea || t.Linea}</div>
                          <div className="text-[9px] text-gray-400 font-mono">{t.PuestoTrabajo}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-blue-700 font-black border-r border-dashed border-gray-100">{t.Tiempo_Min?.toFixed(4)}</td>
                        <td className="px-4 py-3 font-bold text-gray-400">{t.StockActual} / {t.StockSeguridad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
