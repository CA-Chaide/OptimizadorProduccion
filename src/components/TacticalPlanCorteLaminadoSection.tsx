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
import { cn } from '@/lib/utils';

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
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
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

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions = { dens: '—', ancho: '—', largo: '—', esp: '—' };
    if (desc) {
      const densMatch = desc.match(/D-?(\d+)/i);
      if (densMatch) dimensions.dens = densMatch[1];
      const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
      if (dimMatch) {
        dimensions.ancho = dimMatch[1];
        dimensions.largo = dimMatch[2];
        if (dimMatch[3]) dimensions.esp = dimMatch[3];
      }
    }
    return { code, desc, ...dimensions };
  };

  const calculateGroupTotals = (data: any[]) => {
    const map = new Map<string, number>();
    data.forEach(item => {
      const cat = String(item.CATEGORIA || item.Categoria || '').trim();
      if (!cat || cat === 'N/A') return;
      const date = String(item.FECHAINICIO || item.FECHA || 'N/A').trim();
      const key = `${cat}-${date}`;
      const info = extractMaterialInfo(item);
      const qty = Number(item.CANTPROGRAMADA || item.CANTIDAD || 0);
      const esp = parseFloat(info.esp) || 0;
      const alturaTotal = esp * qty;
      map.set(key, (map.get(key) || 0) + alturaTotal);
    });
    return map;
  };

  const groupTotals = useMemo(() => calculateGroupTotals(ordenes), [ordenes]);

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
        <TabsList className="grid grid-cols-4 h-10 bg-gray-100/80 p-1 rounded-xl border mb-8">
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
            <div ref={scrollProv.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-lg"><div style={{ width: scrollProv.width[0], height: '1px' }} /></div>
            <div ref={scrollProv.bottom} className="overflow-x-auto border rounded-b-lg max-h-[600px]">
              <table ref={scrollProv.table} className="w-full border-collapse">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[8px] font-black uppercase text-gray-400 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Orden</th>
                    <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Fecha Inicio</th>
                    <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Material</th>
                    <th className="px-3 py-4 border-r border-dashed border-gray-200 text-left">Descripción</th>
                    <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Categoría</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">DENS.</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">ANCHO</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">LARGO</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-800 bg-blue-50/20">ESP.</th>
                    <th className="px-3 py-4 border-r border-dashed border-gray-200 text-center">Cant.</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-900 bg-blue-50/30">VOLUMEN</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-blue-900 bg-blue-50/30">PESO</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-indigo-900 bg-indigo-50/30">ALTURA TOT.</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-purple-900 bg-purple-50/20">SUMA ALT. GRP</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center text-teal-900 bg-teal-50/20">ALTURA UTIL</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center bg-orange-50/10">NRO SUBBL.</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center bg-orange-50/10">CARGAS (B7)</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center bg-orange-50/10">RESIDUO / DESTINO</th>
                    <th className="px-2 py-4 border-r border-dashed border-gray-200 text-center bg-orange-50/10">CANT. APOYO</th>
                    <th className="px-3 py-4 border-r border-dashed border-gray-200 text-amber-700 bg-amber-50/30 text-center">T. Pl Corte</th>
                    <th className="px-3 py-4 border-r border-dashed border-gray-200 font-bold uppercase text-center">Máquina</th>
                    <th className="px-3 py-4 text-center">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[10px]">
                  {ordenesFiltradas.map((o, i) => {
                    const cat = String(o.CATEGORIA || o.Categoria || '').trim();
                    const hasCategory = cat !== '' && cat !== 'N/A';
                    const info = extractMaterialInfo(o);
                    const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);

                    let volume = 0, weight = 0, alturaTotal = 0, groupSum = 0, alturaUtil: any = '—', calculatedCorteHours = 0;
                    let nSub = 0, cargasB7 = 0, residuo = 0, destino = '—', cantApoyo = 0;

                    if (hasCategory) {
                      const l = parseFloat(info.largo) || 0;
                      const w = parseFloat(info.ancho) || 0;
                      const e = parseFloat(info.esp) || 0;
                      const d = parseFloat(info.dens) || 0;
                      volume = (l * w * e) / 1000000;
                      weight = volume * d;
                      alturaTotal = e * qty;
                      calculatedCorteHours = (qty * 5) / 3600;
                      
                      const date = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
                      groupSum = groupTotals.get(`${cat}-${date}`) || 0;
                      alturaUtil = isNaN(d) ? '—' : (d < 30 ? 103 : 85);

                      if (typeof alturaUtil === 'number') {
                        nSub = alturaTotal / alturaUtil;
                        cargasB7 = Math.floor(nSub / 7);
                        residuo = nSub % 7;
                        if (residuo > 0) {
                          if (residuo <= 2) {
                            destino = "MÁQ. APOYO";
                            cantApoyo = residuo;
                          } else {
                            destino = "+1 CARGA PPAL.";
                          }
                        } else if (nSub > 0) {
                          destino = "COMPLETO";
                        }
                      }
                    }
                    
                    return (
                      <tr key={i} className="hover:bg-red-50/30 transition-colors">
                        <td className="px-3 py-3 font-semibold text-gray-900 border-r border-dashed border-gray-100 text-center">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 text-center font-mono text-[9px] text-gray-500">{o.FECHAINICIO || o.FECHA || '—'}</td>
                        <td className="px-3 py-3 font-mono font-semibold text-red-600 border-r border-dashed border-gray-100 text-center tracking-tighter">{info.code}</td>
                        <td className="px-3 py-3 text-left border-r border-dashed border-gray-100 truncate max-w-[200px] text-gray-500 uppercase">{info.desc}</td>
                        <td className="px-3 py-3 font-medium text-gray-400 border-r border-dashed border-gray-100 text-center uppercase">{hasCategory ? cat : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 text-center bg-blue-50/5">{hasCategory ? info.dens : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 text-center bg-blue-50/5">{hasCategory ? info.ancho : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 text-center bg-blue-50/5">{hasCategory ? info.largo : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 text-center bg-blue-50/5">{hasCategory ? info.esp : '—'}</td>
                        <td className="px-3 py-3 font-semibold text-gray-900 border-r border-dashed border-gray-100 text-center font-mono">{qty}</td>
                        <td className="px-2 py-3 font-mono font-bold text-blue-900 border-r border-dashed border-gray-100 text-center bg-blue-50/10">{hasCategory ? volume.toFixed(2) : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-blue-900 border-r border-dashed border-gray-100 text-center bg-blue-50/10">{hasCategory ? weight.toFixed(2) : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-indigo-900 border-r border-dashed border-gray-100 text-center bg-indigo-50/10">{hasCategory ? alturaTotal.toFixed(2) : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-purple-900 border-r border-dashed border-gray-100 text-center bg-purple-50/5">{hasCategory ? groupSum.toFixed(2) : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-teal-900 border-r border-dashed border-gray-100 text-center bg-teal-50/10">{hasCategory ? alturaUtil : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-orange-700 border-r border-dashed border-gray-100 text-center bg-orange-50/5">{hasCategory ? nSub.toFixed(2) : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-orange-900 border-r border-dashed border-gray-100 text-center bg-orange-50/5">{hasCategory ? cargasB7 : '—'}</td>
                        <td className={cn("px-2 py-3 font-bold border-r border-dashed border-gray-100 text-center text-[8px]", hasCategory && (String(destino).includes('APOYO')) ? 'text-blue-600' : 'text-gray-500')}>{hasCategory ? destino : '—'}</td>
                        <td className="px-2 py-3 font-mono font-bold text-blue-700 border-r border-dashed border-gray-100 text-center">{hasCategory && cantApoyo > 0 ? cantApoyo.toFixed(2) : '—'}</td>
                        <td className="px-3 py-3 font-mono font-bold border-r border-dashed border-gray-100 text-center text-amber-600 bg-amber-50/5">
                          {hasCategory ? calculatedCorteHours.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-3 font-bold border-r border-dashed border-gray-100 text-indigo-600 text-center uppercase">
                          {o.MAQUINA || o.Maquina || o.RECURSO || '—'}
                        </td>
                        <td className="px-3 py-3 font-medium text-gray-400 text-center">{o.Almacen || o.ALMACEN || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="p-6">
            <div ref={scrollTiempos.top} className="overflow-x-auto h-3 bg-gray-50 border-x rounded-t-lg"><div style={{ width: scrollTiempos.width[0], height: '1px' }} /></div>
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
