'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Scissors, Users, Lock, Package, Loader2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';

export const TacticalPlanCorteLaminadoSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanLaminado');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const scrollProv = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

  const fetchGrupos = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo && g.nombre_grupo.toLowerCase().includes('corte y laminado')
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
      setOrders(resProv.data || []);

      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo);
        const dataArray = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        if (dataArray.length > 0) allTiempos.push(...dataArray);
      }
      setTiemposEnsamblado(allTiempos);
    } catch (error) {
      console.error('Error cargando datos:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const groups = await fetchGrupos();
      const ids = groups.map(g => g.codigo_grupo);
      await fetchRestricciones(ids);
      await loadData(groups);
      setIsLoading(false);
    };
    init();
  }, []);

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
      setupScroll(scrollProv);
      if (scrollProv.table.current) scrollProv.width[1](scrollProv.table.current.offsetWidth);
    } else if (activeTab === 'tiempos') {
      setupScroll(scrollTiempos);
      if (scrollTiempos.table.current) scrollTiempos.width[1](scrollTiempos.table.current.offsetWidth);
    }
  }, [activeTab, ordenes, tiemposEnsamblado]);

  const ordenesFiltradas = useMemo(() => {
    const respCodes = restricciones.filter(r => r.nombre_restriccion === 'RESPCTRLPROD').flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim())).filter(v => v !== '');
    return ordenes.filter(o => {
      const itemResp = String(o.RESPCTRLPROD || o.RespCtrlProd || '').trim();
      return respCodes.length === 0 || respCodes.includes(itemResp);
    });
  }, [ordenes, restricciones]);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-red-600" /></div>;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <Scissors className="w-8 h-8 text-red-600" />
        <h2 className="text-2xl font-black uppercase text-gray-800">Planificación Táctica Laminado</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="restricciones">Restricciones</TabsTrigger>
          <TabsTrigger value="ordenes">Provisionales</TabsTrigger>
          <TabsTrigger value="tiempos">Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="p-6 border-2 border-dashed">
                <Badge className="bg-red-600 mb-2">Centro {g.centro}</Badge>
                <h4 className="font-bold uppercase">{g.nombre_grupo}</h4>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card>
            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-center border-collapse">
                <thead className="bg-gray-50 text-[10px] font-bold uppercase text-gray-400">
                  <tr>
                    <th className="px-6 py-4 border-r border-dashed">Parámetro</th>
                    <th className="px-6 py-4 border-r border-dashed">Valor</th>
                    <th className="px-6 py-4">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {restricciones.map(r => (
                    <tr key={r.codigo_restriccion}>
                      <td className="px-6 py-4 font-bold border-r border-dashed">{r.nombre_restriccion}</td>
                      <td className="px-6 py-4 border-r border-dashed"><Badge variant="outline">{r.valor_restriccion}</Badge></td>
                      <td className="px-6 py-4 text-gray-400 italic">{r.descripcion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card className="p-6">
            <div className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-lg"><div style={{ width: scrollProv.width[0], height: '1px' }} /></div>
            <div ref={scrollProv.bottom} className="overflow-x-auto border rounded-b-lg max-h-[400px]">
              <table ref={scrollProv.table} className="w-full text-center border-collapse">
                <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-bold text-gray-500">
                  <tr>
                    <th className="px-4 py-3 border-r border-dashed">Orden</th>
                    <th className="px-4 py-3 border-r border-dashed">Material</th>
                    <th className="px-4 py-3 border-r border-dashed">Cantidad</th>
                    <th className="px-4 py-3">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {ordenesFiltradas.map((o, i) => (
                    <tr key={i} className="hover:bg-red-50/30">
                      <td className="px-4 py-4 font-bold border-r border-dashed">{o.ORDENPREVISIONAL}</td>
                      <td className="px-4 py-4 border-r border-dashed text-center">
                        <div className="font-mono text-red-600 font-bold">
                          {String(o.MATERIAL || '').match(/^\d+/)?.[0]?.slice(-8) || '—'}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase font-black truncate max-w-[200px] mx-auto">
                          {String(o.MATERIAL || '').replace(/^\d+\s*/, '') || o.NOMBRE || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-black border-r border-dashed">{o.CANTIDAD}</td>
                      <td className="px-4 py-4 font-bold text-gray-500">{o.Almacen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="p-6">
            <div className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-lg"><div style={{ width: scrollTiempos.width[0], height: '1px' }} /></div>
            <div ref={scrollTiempos.bottom} className="overflow-x-auto border rounded-b-lg max-h-[400px]">
              <table ref={scrollTiempos.table} className="w-full text-center border-collapse">
                <thead className="bg-gray-100 sticky top-0 text-[10px] uppercase font-bold text-gray-500">
                  <tr>
                    <th className="px-4 py-3 border-r border-dashed">Material</th>
                    <th className="px-4 py-3 border-r border-dashed">Línea Técnica</th>
                    <th className="px-4 py-3 border-r border-dashed">T. Estándar (Min)</th>
                    <th className="px-4 py-3 border-r border-dashed">Stock Actual</th>
                    <th className="px-4 py-3 border-r border-dashed">Seguridad</th>
                    <th className="px-4 py-3">Resp.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {tiemposEnsamblado.map((t, i) => (
                    <tr key={i} className="hover:bg-blue-50/30">
                      <td className="px-4 py-4 font-black border-r border-dashed">{t.CodMaterial}</td>
                      <td className="px-4 py-4 border-r border-dashed">
                        <div className="font-bold">{t.PuestoTrabajoLinea || t.Linea}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{t.PuestoTrabajo}</div>
                      </td>
                      <td className="px-4 py-4 font-mono text-blue-700 font-black border-r border-dashed">{t.Tiempo_Min?.toFixed(4)}</td>
                      <td className="px-4 py-4 border-r border-dashed">{t.StockActual || 0}</td>
                      <td className="px-4 py-4 border-r border-dashed">{t.StockSeguridad || 0}</td>
                      <td className="px-4 py-4 font-bold text-gray-400 uppercase">{t.RespCtrlProd}</td>
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
