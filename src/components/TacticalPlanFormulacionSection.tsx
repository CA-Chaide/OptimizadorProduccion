'use client';

/**
 * @fileOverview Módulo de Planificación Táctica para Formulación.
 * 
 * Corrección: Se añade la columna Máquina en la pestaña de Provisionales.
 * - Lista Necesidades: Unión técnica de Órdenes y Tiempos filtrada por Planta 1000.
 * - Restricciones: Parámetros técnicos exclusivos del Centro 1000.
 * - Grupos: Áreas operativas del Centro 1000.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FlaskConical, Users, Lock, Package, Loader2, Clock, 
  ListChecks
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const TacticalPlanFormulacionSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanFormulacion');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('necesidades');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const initialLoadDone = useRef(false);
  const scrollNecesidadesTop = useRef<HTMLDivElement>(null);
  const scrollNecesidadesBottom = useRef<HTMLDivElement>(null);
  const scrollNecesidadesTable = useRef<HTMLTableElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);

  // Efecto 1: Control de hidratación (Montaje seguro)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Efecto 2: Carga de datos maestros (Solo una vez tras el montaje)
  useEffect(() => {
    if (!mounted || initialLoadDone.current) return;

    const loadAllBaseData = async () => {
      initialLoadDone.current = true;
      setIsLoading(true);
      try {
        // 1. Grupos (Filtrado exclusivo por Centro 1000)
        const resG = await grupoService.getAll();
        const filteredGroups = (resG.data || []).filter(g => 
          g.nombre_grupo && 
          g.nombre_grupo.toLowerCase().includes('corte y laminado') &&
          String(g.centro || '').trim() === '1000'
        );
        setGrupos(filteredGroups);
        const groupsIds = filteredGroups.map(g => g.codigo_grupo);

        // 2. Restricciones (Planta 1000)
        const resR = await restriccionService.getAll();
        const center1000Restrictions = (resR.data || []).filter(r => 
          groupsIds.includes(r.codigo_grupo) && String(r.grupo?.centro || '').trim() === '1000'
        );
        setRestricciones(center1000Restrictions);

        // 3. Órdenes Provisionales
        const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
        const oData = resProv.data?.data || resProv.data || [];
        setOrders(Array.isArray(oData) ? oData : []);

        // 4. Tiempos de Ensamblado (Carga segmentada por grupo Planta 1000)
        const allTiempos: any[] = [];
        for (const g of filteredGroups) {
          if (!g.centro) continue;
          try {
            const resT = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
            const tData = resT.data?.data || resT.data || [];
            if (Array.isArray(tData)) {
              allTiempos.push(...tData);
            }
          } catch (err) {
            console.warn(`Error cargando tiempos para grupo ${g.codigo_grupo}:`, err);
          }
        }
        setTiemposEnsamblado(allTiempos);

        inspector.captureVariable('dataLoaded', { 
            groups: filteredGroups.length,
            restrictions: center1000Restrictions.length,
            orders: Array.isArray(oData) ? oData.length : 0, 
            times: allTiempos.length 
        });
      } catch (error) {
        console.error('Error en inicialización táctica:', error);
        addNotification('error', 'Fallo al cargar datos maestros de formulación');
      } finally {
        setIsLoading(false);
      }
    };

    loadAllBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]); // Solo depende del estado mounted para iniciar

  const extractMaterialCode = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const match = matStr.match(/^(\d+)/);
    return match ? match[1].slice(-8) : matStr.slice(-8);
  };

  // Lógica de unión técnica: Provisionales + Tiempos + Filtros de Planta 1000
  const listaNecesidades = useMemo(() => {
    const respCodes = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    const almCodes = restricciones
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    const timesMap = new Map<string, any>();
    tiemposEnsamblado.forEach(t => {
      const code = String(t.CodMaterial || t.Material || '').trim().slice(-8);
      if (code) timesMap.set(code, t);
    });

    return ordenes
      .filter(o => {
        // Filtro estricto por Planta 1000
        const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
        if (itemCentro !== '' && itemCentro !== '1000') return false; 

        // Validación contra restricciones dinámicas
        const itemResp = String(o.RESPCONTROLPROD || o.RESPCTRLPROD || o.RespCtrlProd || '').trim();
        const matchResp = respCodes.length === 0 || respCodes.includes(itemResp);
        const itemAlm = String(o.Almacen || o.ALMACEN || o.almacen || '').trim();
        const matchAlm = almCodes.length === 0 || almCodes.some(c => itemAlm === c || itemAlm.includes(c));
        
        return matchResp && matchAlm;
      })
      .map(o => {
        const code = extractMaterialCode(o);
        const t = timesMap.get(code);
        const nameStr = String(o.NOMBRE || o.NombreMaterial || o.Descripcion || '').trim();
        const desc = nameStr || String(o.MATERIAL || '').replace(/^\d+\s*/, '') || '—';

        return {
          centro: o.Centro || o.CENTRO || t?.Centro || '1000',
          almacen: o.Almacen || o.ALMACEN || '—',
          categoria: o.CATEGORIA || o.Categoria || '—',
          material: code,
          descripcion: desc,
          cantidad: o.CANTIDAD || o.CANTPROGRAMADA || 0,
          lineaTecnica: t?.Linea || t?.PuestoTrabajoLinea || '—',
          maquina: o.Maquina || o.MAQUINA || '—',
          tiempo: t?.Tiempo_Min || t?.Tiempo || 0
        };
      });
  }, [ordenes, tiemposEnsamblado, restricciones]);

  // Sincronización de scroll para la tabla de necesidades
  useEffect(() => {
    if (activeTab === 'necesidades' && mounted) {
      const top = scrollNecesidadesTop.current;
      const bottom = scrollNecesidadesBottom.current;
      if (!top || !bottom) return;
      const syncB = () => { if (bottom) bottom.scrollLeft = top.scrollLeft; };
      const syncT = () => { if (top) top.scrollLeft = bottom.scrollLeft; };
      top.addEventListener('scroll', syncB);
      bottom.addEventListener('scroll', syncT);
      const timer = setTimeout(() => {
        if (scrollNecesidadesTable.current) setScrollWidth(scrollNecesidadesTable.current.offsetWidth);
      }, 500);
      return () => {
        top.removeEventListener('scroll', syncB);
        bottom.removeEventListener('scroll', syncT);
        clearTimeout(timer);
      };
    }
  }, [activeTab, mounted, listaNecesidades]);

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Cargando Planta 1000 - Formulación...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center space-x-4 pb-4 border-b border-gray-100">
        <div className="p-2 bg-teal-50 rounded-xl shadow-sm"><FlaskConical className="w-6 h-6 text-teal-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Táctica Formulación</h2>
          <Badge variant="outline" className="text-[10px] font-bold border-teal-200 text-teal-700 bg-teal-50 mt-1 uppercase">Planta 1000 - Quito</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'necesidades', l: 'Necesidades', i: ListChecks },
            { v: 'grupos', l: 'Grupos (C1000)', i: Users }, 
            { v: 'restricciones', l: 'Restricciones', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="necesidades" className="animate-in fade-in duration-300">
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
            <div className="p-4 bg-indigo-50/50 border-b border-indigo-100 text-left">
              <h3 className="text-xs font-black uppercase text-indigo-900 flex items-center gap-2">
                <ListChecks className="w-4 h-4" /> Unión Táctica: Provisionales + Tiempos (Planta 1000)
              </h3>
              <p className="text-[10px] text-indigo-600 mt-1">Cruce por CodMaterial basado en Restricciones Técnicas</p>
            </div>
            <div ref={scrollNecesidadesTop} className="overflow-x-auto h-3 bg-gray-50 border-b border-indigo-100">
              <div style={{ width: scrollWidth, height: '1px' }} />
            </div>
            <div ref={scrollNecesidadesBottom} className="overflow-x-auto max-h-[600px]">
              <table ref={scrollNecesidadesTable} className="w-full border-collapse text-center">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[9px] font-black uppercase text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-200">Centro</th>
                    <th className="px-4 py-4 border-r border-gray-200">Almacén</th>
                    <th className="px-4 py-4 border-r border-gray-200 text-blue-700 bg-blue-50/20">Categoría</th>
                    <th className="px-4 py-4 border-r border-gray-200">Material</th>
                    <th className="px-4 py-4 border-r border-gray-200 text-left">Descripción</th>
                    <th className="px-4 py-4 border-r border-gray-200">Cantidad</th>
                    <th className="px-4 py-4 border-r border-gray-200 text-purple-700 bg-purple-50/20">Línea Técnica</th>
                    <th className="px-4 py-4 border-r border-gray-200 text-orange-700 bg-orange-50/10">Máquina</th>
                    <th className="px-4 py-4 text-teal-700 bg-teal-50/20">Tiempo (Min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px]">
                  {listaNecesidades.length === 0 ? (
                    <tr><td colSpan={9} className="py-20 text-center text-gray-400 font-medium italic">Sin resultados filtrados para Planta 1000</td></tr>
                  ) : (
                    listaNecesidades.map((row, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-400 border-r border-dashed border-gray-100">{row.centro}</td>
                        <td className="px-4 py-3 font-mono text-gray-400 border-r border-dashed border-gray-100">{row.almacen}</td>
                        <td className="px-4 py-3 font-bold text-blue-700 border-r border-dashed border-gray-100 bg-blue-50/5 uppercase">{row.categoria}</td>
                        <td className="px-4 py-3 font-mono font-bold text-primary border-r border-dashed border-gray-100 tracking-tighter">{row.material}</td>
                        <td className="px-4 py-3 text-left border-r border-dashed border-gray-100 text-gray-500 uppercase truncate max-w-[220px]">{row.descripcion}</td>
                        <td className="px-4 py-3 font-black text-slate-800 border-r border-dashed border-gray-100 font-mono">{row.cantidad.toLocaleString()}</td>
                        <td className="px-4 py-3 font-bold text-purple-700 border-r border-dashed border-gray-100 bg-purple-50/5 uppercase">{row.lineaTecnica}</td>
                        <td className="px-4 py-3 font-bold text-orange-700 border-r border-dashed border-gray-100 bg-orange-50/5 uppercase">{row.maquina}</td>
                        <td className="px-4 py-3 font-mono font-black text-teal-600 bg-teal-50/5">{row.tiempo.toFixed(4)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-6">
                <div className="absolute top-0 left-0 w-1 h-full bg-teal-500" />
                <Badge className="bg-teal-50 text-teal-700 mb-2 font-bold text-[9px] uppercase">PLANTA {g.centro}</Badge>
                <h4 className="font-bold text-gray-800 uppercase text-sm">{g.nombre_grupo}</h4>
                <p className="text-[10px] font-medium text-gray-400 mt-2 uppercase">ID: {g.codigo_grupo}</p>
              </Card>
            ))}
            {grupos.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-400 italic">No hay grupos de la Planta 1000 cargados</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Parámetro (Quito)</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Valor</th>
                  <th className="px-6 py-5 text-left">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px]">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-teal-50/20">
                    <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-200 uppercase">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-dashed border-gray-200">
                      <Badge variant="outline" className="font-mono text-teal-700 border-teal-200 bg-teal-50/50">{r.valor_restriccion}</Badge>
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
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-center">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Orden</th>
                    <th className="px-4 py-4 border-r border-gray-100">CodMaterial</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-left">Nombre</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-orange-700 bg-orange-50/10">Máquina</th>
                    <th className="px-4 py-4 border-r border-gray-100">Cantidad</th>
                    <th className="px-4 py-4">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px]">
                  {ordenes.length === 0 ? (
                    <tr><td colSpan={6} className="py-20 text-center text-gray-400 font-medium italic">Sin órdenes provisonales cargadas</td></tr>
                  ) : (
                    ordenes.map((o, i) => (
                      <tr key={i} className="hover:bg-teal-50/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-900 border-r border-gray-100">{o.ORDENPREVISIONAL}</td>
                        <td className="px-4 py-3 font-mono font-bold text-teal-700 border-r border-gray-100">{extractMaterialCode(o)}</td>
                        <td className="px-4 py-3 text-left border-r border-dashed border-gray-100 text-gray-500 uppercase truncate max-w-[300px]">
                          {String(o.NOMBRE || o.NombreMaterial || o.Descripcion || '').trim() || String(o.MATERIAL || '').replace(/^\d+\s*/, '') || '—'}
                        </td>
                        <td className="px-4 py-3 font-bold text-orange-700 border-r border-dashed border-gray-100 bg-orange-50/5 uppercase">
                          {o.Maquina || o.MAQUINA || '—'}
                        </td>
                        <td className="px-4 py-3 font-black text-slate-800 border-r border-gray-100 font-mono">{o.CANTIDAD || 0}</td>
                        <td className="px-4 py-3 text-gray-400 font-bold uppercase">{o.Almacen || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-center">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">CodMaterial</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-teal-700">Tiempo (Min)</th>
                    <th className="px-4 py-4">Centro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px]">
                  {tiemposEnsamblado.map((t, i) => (
                    <tr key={i} className="hover:bg-teal-50/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-teal-700 border-r border-gray-100">{String(t.CodMaterial || t.Material || '').trim().slice(-8)}</td>
                      <td className="px-4 py-3 text-left border-r border-dashed border-gray-100 text-gray-500 uppercase truncate max-w-[300px]">{t.Material || t.Descripcion || '—'}</td>
                      <td className="px-4 py-3 font-mono font-black text-teal-600 border-r border-gray-100">{(t.Tiempo_Min || t.Tiempo || 0).toFixed(4)}</td>
                      <td className="px-4 py-3 font-bold text-gray-400 uppercase">{t.Centro || '—'}</td>
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
