'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Scissors, Users, Lock, Package, Loader2, Clock, LayoutDashboard, ClipboardList, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { MaestroMaterialesExplosionSection } from './MaestroMaterialesExplosionSection';
import { TacticalNeedsSection } from './TacticalNeedsSection';

export const TacticalPlanCorteLaminadoSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanLaminado');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGrupos = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        const center = String(g.centro || '').trim();
        return name.includes('corte y laminado') && center === '1000';
      });
      setGrupos(filtered);
      inspector.captureVariable('gruposLaminado1000', filtered);
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
      setRestriccionesArray(filtered);
      inspector.captureVariable('restriccionesLaminado1000', filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando restricciones:', error);
      return [];
    }
  };

  const fetchOrdenes = async () => {
    try {
      const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      const data = resProv.data?.data || resProv.data || [];
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
    }
  };

  const fetchTiemposEnsamblado = async () => {
    try {
      const res = await serviciosService.getTiemposEnsamblado(1, 10000);
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data)) {
        const filtered = data.filter((t: any) => String(t.Centro || t.centro || '').trim() === '1000');
        setTiemposEnsamblado(filtered);
        inspector.captureVariable('tiemposCompletosLaminado1000', filtered.length);
      }
    } catch (error) {
      console.error('Error cargando tiempos:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const groups = await fetchGrupos();
      const ids = groups.map(g => g.codigo_grupo);
      await Promise.all([
        fetchRestricciones(ids),
        fetchOrdenes(),
        fetchTiemposEnsamblado()
      ]);
      setIsLoading(false);
    };
    init();
  }, []);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    return { code, desc };
  };

  // Mapa de Tiempos usando Código de 8 dígitos como ID
  const tiemposMap = useMemo(() => {
    const map = new Map<string, { tiempo: number; puesto: string }>();
    tiemposEnsamblado.forEach(t => {
      const info = extractMaterialInfo(t);
      if (info.code) {
        map.set(info.code, { 
          tiempo: Number(t.Tiempo_Min || t.Tiempo || 0),
          puesto: String(t.PuestoTrabajo || t.Puesto || '—')
        });
      }
    });
    return map;
  }, [tiemposEnsamblado]);

  // Consolidación de Restricciones del Grupo
  const appliedRestrictionsSummary = useMemo(() => {
    const resps = restriccionesArray.filter(r => r.nombre_restriccion === 'RESPCTRLPROD').map(r => r.valor_restriccion);
    const alms = restriccionesArray.filter(r => r.nombre_restriccion === 'ALMACEN').map(r => r.valor_restriccion);
    const sectors = restriccionesArray.filter(r => r.nombre_restriccion === 'SECTOR').map(r => r.valor_restriccion);

    return {
      responsables: [...new Set(resps.flatMap(v => v.split(/[,&]/).map(s => s.trim())))].filter(Boolean),
      almacenes: [...new Set(alms.flatMap(v => v.split(/[,&]/).map(s => s.trim())))].filter(Boolean),
      sectores: [...new Set(sectors.flatMap(v => v.split(/[,&]/).map(s => s.trim())))].filter(Boolean)
    };
  }, [restriccionesArray]);

  // Filtrado de Órdenes aplicando TODAS las restricciones del grupo
  const ordenesFiltradas = useMemo(() => {
    const { responsables, almacenes, sectores } = appliedRestrictionsSummary;

    return ordenes.filter(o => {
      const itemCentro = String(o.CENTRO || o.Centro || o.centro || '').trim();
      if (itemCentro !== '1000') return false;
      
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = responsables.length === 0 || responsables.includes(itemResp);
      if (!matchResp) return false;

      const itemAlm = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      const matchAlm = almacenes.length === 0 || almacenes.includes(itemAlm);
      if (!matchAlm) return false;

      const itemSector = String(o.SECTOR || o.Sector || o.SECTORDESC || '').trim();
      const matchSector = sectores.length === 0 || sectores.some(s => itemSector.includes(s));
      if (!matchSector) return false;

      return true;
    });
  }, [ordenes, appliedRestrictionsSummary]);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-red-600" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Táctico Corte Laminado</h2>
            <p className="text-xs text-gray-500 font-medium">Control de Carga Operativa - Centro 1000 (Quito)</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-7 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Resumen', i: LayoutDashboard }, 
            { v: 'necesidades', l: 'Necesidades', i: Layers }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Restricciones', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos', i: Clock },
            { v: 'maestro', l: 'M. Materiales', i: ClipboardList }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-6">
          <div className="bg-red-50/50 p-6 rounded-2xl border border-red-100 text-center space-y-2">
            <h3 className="text-sm font-black text-red-800 uppercase tracking-widest">Estado de Carga - Planta 1000</h3>
            <p className="text-xs text-red-600 font-medium max-w-md mx-auto">Visualización consolidada de órdenes filtradas por Responsable, Almacén y Sector.</p>
            <div className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-3 rounded-xl shadow-sm border border-red-100">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Grupos Activos</p>
                <p className="text-xl font-black text-gray-800">{grupos.length}</p>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-sm border border-red-100">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Órdenes Filtradas</p>
                <p className="text-xl font-black text-gray-800">{ordenesFiltradas.length}</p>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-sm border border-red-100">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Restricciones</p>
                <p className="text-xl font-black text-gray-800">{restriccionesArray.length}</p>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-sm border border-red-100">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Capacidad Base</p>
                <p className="text-xl font-black text-green-600">NORMAL</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="necesidades">
          <TacticalNeedsSection ordenes={ordenesFiltradas} tiempos={tiemposEnsamblado} />
        </TabsContent>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-6">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-600" />
                <Badge className="bg-red-50 text-red-700 mb-2 font-bold text-[9px] uppercase border-red-200">PLANTA {g.centro}</Badge>
                <h4 className="font-bold text-gray-800 uppercase text-sm">{g.nombre_grupo}</h4>
                <p className="text-[9px] font-mono text-gray-400 mt-2">ID GRUPO: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">ID Grupo</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Parámetro</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Valor</th>
                  <th className="px-6 py-5 text-left">Descripción Operativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px]">
                {restriccionesArray.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-mono text-gray-400 border-r border-dashed border-gray-200">{r.codigo_grupo}</td>
                    <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-200 uppercase">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-dashed border-gray-200">
                      <Badge variant="outline" className="font-mono text-red-700 border-red-200 bg-red-50/50">{r.valor_restriccion}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full border-collapse text-center font-sans">
                <thead className="bg-gray-100/80 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                    <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                    <th className="px-3 py-4 border-r border-gray-100">Material</th>
                    <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                    <th className="px-3 py-4 border-r border-gray-100">Cant.</th>
                    <th className="px-3 py-4 border-r border-gray-100 text-teal-700 bg-teal-50/20 font-black">T. estandar (H)</th>
                    <th className="px-3 py-4 border-r border-gray-100 font-black">Puesto Trabajo</th>
                    <th className="px-3 py-4 border-r border-gray-100 font-black">Máquina</th>
                    <th className="px-3 py-4 font-black">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[10px]">
                  {ordenesFiltradas.map((o, i) => {
                    const info = extractMaterialInfo(o);
                    const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                    
                    // Buscar coincidencia en el mapa de tiempos por ID de material
                    const match = tiemposMap.get(info.code);
                    const stdMin = match?.tiempo || 0;
                    const totalHours = (qty * stdMin) / 60;
                    const puestoTrabajo = match?.puesto || '—';
                    
                    return (
                      <tr key={i} className="hover:bg-red-50/20 transition-colors">
                        <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                        <td className="px-3 py-2 font-mono font-bold text-red-600 border-r border-gray-100 tracking-tighter">{info.code}</td>
                        <td className="px-3 py-2 text-left border-r border-gray-50 truncate max-w-[250px] text-gray-500 uppercase">{info.desc}</td>
                        <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-50 font-mono">{qty}</td>
                        <td className="px-3 py-2 font-mono font-bold text-teal-600 border-r border-gray-50 bg-teal-50/5">
                          {totalHours > 0 ? totalHours.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-50 uppercase">{puestoTrabajo}</td>
                        <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-50 uppercase">{o.MAQUINA || o.Maquina || o.RECURSO || '—'}</td>
                        <td className="px-3 py-2 font-medium text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos" className="space-y-4">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-center">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Material</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                    <th className="px-4 py-4 border-r border-gray-100">Puesto Trabajo / Línea</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-teal-600">Estándar (Min)</th>
                    <th className="px-4 py-4">Stock Actual / Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {tiemposEnsamblado.map((t, i) => {
                    const info = extractMaterialInfo(t);
                    return (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-red-600 border-r border-gray-50">{info.code}</td>
                        <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[300px]">{info.desc}</td>
                        <td className="px-4 py-3 border-r border-gray-50 font-bold text-gray-400 uppercase">
                          <div className="text-[10px]">{t.Linea || t.PuestoTrabajoLinea}</div>
                          <div className="text-[8px] font-mono opacity-60">{t.PuestoTrabajo}</div>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-teal-600 border-r border-gray-50">{(t.Tiempo_Min || t.Tiempo || 0).toFixed(4)}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono">{(t.StockActual || 0)} / {(t.StockSeguridad || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="maestro" className="animate-in fade-in duration-300">
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
            <CardContent className="p-0">
              <MaestroMaterialesExplosionSection ordenes={ordenesFiltradas} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
