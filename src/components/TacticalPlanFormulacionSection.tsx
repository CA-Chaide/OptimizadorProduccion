'use client';

/**
 * @fileOverview Módulo de Planificación Táctica para Formulación (Multi-Centro).
 * Especializado en Planta 1000 y 2000.
 * Restringido a grupos de Corte y Laminado.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FlaskConical, Users, Lock, Package, Loader2, Clock, 
  ListChecks, MapPin
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
  
  // Refs para sincronización de scroll (C1000)
  const scrollN1000Top = useRef<HTMLDivElement>(null);
  const scrollN1000Bottom = useRef<HTMLDivElement>(null);
  const scrollN1000Table = useRef<HTMLTableElement>(null);
  const [width1000, setWidth1000] = useState(0);

  // Refs para sincronización de scroll (C2000)
  const scrollN2000Top = useRef<HTMLDivElement>(null);
  const scrollN2000Bottom = useRef<HTMLDivElement>(null);
  const scrollN2000Table = useRef<HTMLTableElement>(null);
  const [width2000, setWidth2000] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || initialLoadDone.current) return;

    const loadAllBaseData = async () => {
      initialLoadDone.current = true;
      setIsLoading(true);
      try {
        // 1. Grupos: Filtro exclusivo "Corte y Laminado" para 1000 y 2000. 
        // Se excluye "Formulación" por solicitud del usuario.
        const resG = await grupoService.getAll();
        const filteredGroups = (resG.data || []).filter(g => {
          const name = (g.nombre_grupo || '').toLowerCase();
          const centro = String(g.centro || '').trim();
          return (centro === '1000' || centro === '2000') && 
                 (name.includes('corte') || name.includes('laminado')) &&
                 !(name.includes('formulacion') || name.includes('formulación'));
        });
        setGrupos(filteredGroups);
        const groupsIds = filteredGroups.map(g => g.codigo_grupo);

        // 2. Restricciones
        const resR = await restriccionService.getAll();
        const relevantRestrictions = (resR.data || []).filter(r => 
          groupsIds.includes(r.codigo_grupo)
        );
        setRestricciones(relevantRestrictions);

        // 3. Órdenes Provisionales
        const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
        const oData = resProv.data?.data || resProv.data || [];
        setOrders(Array.isArray(oData) ? oData : []);

        // 4. Tiempos de Ensamblado (Carga segmentada por planta)
        const allTiempos: any[] = [];
        const centers = ['1000', '2000'];
        for (const c of centers) {
          const plantGroups = filteredGroups.filter(g => String(g.centro).trim() === c);
          for (const g of plantGroups) {
            try {
              const resT = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(c, g.codigo_grupo);
              const tData = resT.data?.data || resT.data || [];
              if (Array.isArray(tData)) allTiempos.push(...tData);
            } catch (err) {
              console.warn(`Error cargando tiempos para planta ${c}, grupo ${g.codigo_grupo}`);
            }
          }
        }
        setTiemposEnsamblado(allTiempos);

        inspector.captureVariable('dataLoaded', { 
            groups: filteredGroups.length,
            restrictions: relevantRestrictions.length,
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
  }, [mounted, inspector, addNotification]);

  const extractMaterialCode = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const match = matStr.match(/^(\d+)/);
    return match ? match[1].slice(-8) : matStr.slice(-8);
  };

  /**
   * Helper robusto para obtener el valor de la Máquina/Recurso
   */
  const getMachineValue = (item: any): string => {
    if (!item) return '—';
    const possibleKeys = ['MAQUINA', 'Maquina', 'maquina', 'RECURSO', 'recurso', 'TEXTO_RECURSO', 'CENTRO_TRABAJO', 'PuestoTrabajo'];
    for (const key of possibleKeys) {
      if (item[key] && String(item[key]).trim() !== '') return String(item[key]).trim();
    }
    const dynamicKey = Object.keys(item).find(k => k.toUpperCase().includes('MAQU') || k.toUpperCase().includes('RECUR') || k.toUpperCase().includes('PUESTO'));
    if (dynamicKey && item[dynamicKey] && String(item[dynamicKey]).trim() !== '') return String(item[dynamicKey]).trim();
    return '—';
  };

  const filterOrdersByCenter = (centroId: string) => {
    const relevantGroupIds = grupos
      .filter(g => String(g.centro || '').trim() === centroId)
      .map(g => g.codigo_grupo);

    const groupRest = restricciones.filter(r => relevantGroupIds.includes(r.codigo_grupo));

    const respCodes = groupRest
      .filter(r => r.nombre_restriccion.toUpperCase() === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    const almCodes = groupRest
      .filter(r => r.nombre_restriccion.toUpperCase() === 'ALMACEN')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return ordenes.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centroId && itemCentro !== '') return false;

      const itemResp = String(o.RESPCONTROLPROD || o.RESPCTRLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = respCodes.length === 0 || respCodes.some(code => itemResp === code || itemResp.includes(code));
      
      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      const hasAlmField = o.hasOwnProperty('ALMACEN') || o.hasOwnProperty('Almacen') || o.hasOwnProperty('almacen');
      const matchAlm = !hasAlmField || almCodes.length === 0 || itemAlmValue === '' || almCodes.includes(itemAlmValue);
      
      return matchResp && matchAlm;
    });
  };

  const ordenesC1000 = useMemo(() => filterOrdersByCenter('1000'), [ordenes, grupos, restricciones]);
  const ordenesC2000 = useMemo(() => filterOrdersByCenter('2000'), [ordenes, grupos, restricciones]);

  const generateNeedsList = (filteredOrders: any[], centerId: string) => {
    const timesMap = new Map<string, any>();
    tiemposEnsamblado
      .filter(t => String(t.Centro || t.centro || '').trim() === centerId)
      .forEach(t => {
        const code = String(t.CodMaterial || t.Material || '').trim().slice(-8);
        if (code) timesMap.set(code, t);
      });

    return filteredOrders.map(o => {
      const code = extractMaterialCode(o);
      const t = timesMap.get(code);
      const nameStr = String(o.NOMBRE || o.NombreMaterial || o.Descripcion || '').trim();
      const desc = nameStr || String(o.MATERIAL || '').replace(/^\d+\s*/, '') || '—';

      return {
        centro: centerId,
        almacen: o.Almacen || o.ALMACEN || '—',
        categoria: o.CATEGORIA || o.Categoria || '—',
        material: code,
        descripcion: desc,
        cantidad: o.CANTIDAD || o.CANTPROGRAMADA || 0,
        lineaTecnica: t?.Linea || t?.PuestoTrabajoLinea || '—',
        maquina: getMachineValue(o),
        tiempo: t?.Tiempo_Min || t?.Tiempo || 0
      };
    });
  };

  const needsC1000 = useMemo(() => generateNeedsList(ordenesC1000, '1000'), [ordenesC1000, tiemposEnsamblado]);
  const needsC2000 = useMemo(() => generateNeedsList(ordenesC2000, '2000'), [ordenesC2000, tiemposEnsamblado]);

  const setupScroll = (topRef: React.RefObject<HTMLDivElement>, bottomRef: React.RefObject<HTMLDivElement>, tableRef: React.RefObject<HTMLTableElement>, setWidth: (w: number) => void) => {
    const top = topRef.current;
    const bottom = bottomRef.current;
    if (!top || !bottom) return;
    const syncB = () => { if (bottom) bottom.scrollLeft = top.scrollLeft; };
    const syncT = () => { if (top) top.scrollLeft = bottom.scrollLeft; };
    top.addEventListener('scroll', syncB);
    bottom.addEventListener('scroll', syncT);
    setTimeout(() => { if (tableRef.current) setWidth(tableRef.current.offsetWidth); }, 500);
    return () => {
      top.removeEventListener('scroll', syncB);
      bottom.removeEventListener('scroll', syncT);
    };
  };

  useEffect(() => {
    if (activeTab === 'necesidades' && mounted) {
      const clean1 = setupScroll(scrollN1000Top, scrollN1000Bottom, scrollN1000Table, setWidth1000);
      const clean2 = setupScroll(scrollN2000Top, scrollN2000Bottom, scrollN2000Table, setWidth2000);
      return () => { clean1?.(); clean2?.(); };
    }
  }, [activeTab, mounted, needsC1000, needsC2000]);

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Formulación Multi-Planta...</p>
    </div>
  );

  const renderNeedsTable = (data: any[], topRef: any, bottomRef: any, tableRef: any, width: number, title: string, colorClass: string) => (
    <div className="space-y-4">
      <div className={cn("p-4 rounded-t-2xl border-b text-left", colorClass)}>
        <h3 className="text-xs font-black uppercase flex items-center gap-2 text-slate-800">
          <ListChecks className="w-4 h-4" /> {title}
        </h3>
      </div>
      <div ref={topRef} className="overflow-x-auto h-3 bg-gray-50 border-b">
        <div style={{ width: width, height: '1px' }} />
      </div>
      <div ref={bottomRef} className="overflow-x-auto max-h-[400px]">
        <table ref={tableRef} className="w-full border-collapse text-center">
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
          <tbody className="divide-y divide-gray-100 text-[10px]">
            {data.length === 0 ? (
              <tr><td colSpan={9} className="py-12 text-center text-gray-400 italic">Sin resultados para esta planta</td></tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-2 font-bold text-gray-400 border-r border-dashed border-gray-100">{row.centro}</td>
                  <td className="px-4 py-2 font-mono text-gray-400 border-r border-dashed border-gray-100">{row.almacen}</td>
                  <td className="px-4 py-2 font-bold text-blue-700 border-r border-dashed border-gray-100 bg-blue-50/5 uppercase">{row.categoria}</td>
                  <td className="px-4 py-2 font-mono font-bold text-primary border-r border-dashed border-gray-100 tracking-tighter">{row.material}</td>
                  <td className="px-4 py-2 text-left border-r border-dashed border-gray-100 text-gray-500 uppercase truncate max-w-[180px]">{row.descripcion}</td>
                  <td className="px-4 py-2 font-black text-slate-800 border-r border-dashed border-gray-100 font-mono">{row.cantidad.toLocaleString()}</td>
                  <td className="px-4 py-2 font-bold text-purple-700 border-r border-dashed border-gray-100 bg-purple-50/5 uppercase">{row.lineaTecnica}</td>
                  <td className="px-4 py-2 font-black text-orange-700 border-r border-dashed border-gray-100 bg-orange-50/5 uppercase">{row.maquina}</td>
                  <td className="px-4 py-2 font-mono font-black text-teal-600 bg-teal-50/5">{row.tiempo.toFixed(4)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderOrdersTable = (data: any[], title: string, colorClass: string) => (
    <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white h-full">
      <div className={cn("p-4 border-b text-left", colorClass)}>
        <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
          <Package className="w-4 h-4" /> {title} ({data.length})
        </h3>
      </div>
      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full border-collapse text-center">
          <thead className="bg-gray-100 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-500 border-b border-gray-100">
            <tr>
              <th className="px-3 py-4 border-r border-gray-100">Orden</th>
              <th className="px-3 py-4 border-r border-gray-100">Material</th>
              <th className="px-3 py-4 border-r border-gray-100 text-left">Nombre</th>
              <th className="px-3 py-4 border-r border-gray-100 text-orange-700 bg-orange-50/10">Máquina</th>
              <th className="px-3 py-4 border-r border-gray-100">Cantidad</th>
              <th className="px-3 py-4">Almacén</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-[10px]">
            {data.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400 italic">Sin órdenes (Restricciones Aplicadas)</td></tr>
            ) : (
              data.map((o, i) => (
                <tr key={i} className="hover:bg-gray-50/30 transition-colors">
                  <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN}</td>
                  <td className="px-3 py-2 font-mono font-bold text-teal-700 border-r border-gray-100">{extractMaterialCode(o)}</td>
                  <td className="px-3 py-2 text-left border-r border-dashed border-gray-100 text-gray-500 uppercase truncate max-w-[200px]">
                    {String(o.NOMBRE || o.NombreMaterial || o.Descripcion || '').trim() || String(o.MATERIAL || '').replace(/^\d+\s*/, '') || '—'}
                  </td>
                  <td className="px-3 py-2 font-black text-orange-700 border-r border-dashed border-gray-100 bg-orange-50/5 uppercase">
                    {getMachineValue(o)}
                  </td>
                  <td className="px-3 py-2 font-black text-slate-800 border-r border-gray-100 font-mono">{o.CANTIDAD || o.CANTPROGRAMADA || 0}</td>
                  <td className="px-3 py-2 text-gray-400 font-bold uppercase">{o.Almacen || o.ALMACEN || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center space-x-4 pb-4 border-b border-gray-100">
        <div className="p-2 bg-teal-50 rounded-xl shadow-sm"><FlaskConical className="w-6 h-6 text-teal-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Táctica Formulación (Corte y Laminado)</h2>
          <div className="flex gap-2 mt-1">
             <Badge variant="outline" className="text-[9px] font-black border-green-200 text-green-700 bg-green-50 uppercase">Planta 1000 - Quito</Badge>
             <Badge variant="outline" className="text-[9px] font-black border-indigo-200 text-indigo-700 bg-indigo-50 uppercase">Planta 2000 - Gye</Badge>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'necesidades', l: 'Lista Necesidades', i: ListChecks },
            { v: 'grupos', l: 'Grupos / Áreas', i: Users }, 
            { v: 'restricciones', l: 'Filtros Técnicos', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="necesidades" className="space-y-10 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
              {renderNeedsTable(needsC1000, scrollN1000Top, scrollN1000Bottom, scrollN1000Table, width1000, "Necesidades Planta 1000", "bg-green-50/50 border-green-100")}
            </Card>
            <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
              {renderNeedsTable(needsC2000, scrollN2000Top, scrollN2000Bottom, scrollN2000Table, width2000, "Necesidades Planta 2000", "bg-indigo-50/50 border-indigo-100")}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="grupos" className="animate-in fade-in duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xs font-black uppercase text-green-700 mb-4 px-1 flex items-center gap-2">
                <MapPin className="w-3 h-3" /> Quito (Centro 1000)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {grupos.filter(g => String(g.centro) === '1000').map(g => (
                  <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-4">
                    <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />
                    <h4 className="font-bold text-gray-800 uppercase text-[11px] leading-tight">{g.nombre_grupo}</h4>
                    <p className="text-[9px] font-medium text-gray-400 mt-2 uppercase">ID: {g.codigo_grupo}</p>
                  </Card>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-black uppercase text-indigo-700 mb-4 px-1 flex items-center gap-2">
                <MapPin className="w-3 h-3" /> Guayaquil (Centro 2000)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {grupos.filter(g => String(g.centro) === '2000').map(g => (
                  <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-4">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                    <h4 className="font-bold text-gray-800 uppercase text-[11px] leading-tight">{g.nombre_grupo}</h4>
                    <p className="text-[9px] font-medium text-gray-400 mt-2 uppercase">ID: {g.codigo_grupo}</p>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="restricciones" className="animate-in fade-in duration-300">
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Planta</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Parámetro</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Valor</th>
                  <th className="px-6 py-5 text-left">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px]">
                {restricciones.sort((a,b) => String(a.grupo?.centro).localeCompare(String(b.grupo?.centro))).map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-teal-50/20">
                    <td className="px-6 py-4 border-r border-dashed border-gray-200">
                      <Badge variant="outline" className={cn("text-[9px] font-black uppercase", r.grupo?.centro === '1000' ? "border-green-200 text-green-700 bg-green-50" : "border-indigo-200 text-indigo-700 bg-indigo-50")}>
                        {r.grupo?.centro === '1000' ? 'QUITO' : 'GYE'}
                      </Badge>
                    </td>
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

        <TabsContent value="ordenes" className="animate-in fade-in duration-300">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 h-full items-start">
            {renderOrdersTable(ordenesC1000, "Órdenes Planta 1000 (Filtros Planta)", "bg-green-50/50 border-green-100")}
            {renderOrdersTable(ordenesC2000, "Órdenes Planta 2000 (Filtros Planta)", "bg-indigo-50/50 border-indigo-100")}
          </div>
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[ 
              { t: 'Ingeniería Planta 1000', d: tiemposEnsamblado.filter(t => String(t.Centro).trim() === '1000'), c: 'text-green-700', b: 'bg-green-600' }, 
              { t: 'Ingeniería Planta 2000', d: tiemposEnsamblado.filter(t => String(t.Centro).trim() === '2000'), c: 'text-indigo-700', b: 'bg-indigo-600' } 
            ].map((center, idx) => (
              <div key={idx} className="space-y-3 text-left">
                <h3 className={cn("text-[10px] font-black uppercase px-1 flex items-center gap-2", center.c)}>
                   <Clock className="w-3 h-3" /> {center.t}
                </h3>
                <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full border-collapse text-center">
                      <thead className="bg-gray-100 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-500 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-4 border-r border-gray-100">Material</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                          <th className="px-4 py-4 text-teal-700 bg-teal-50/20">Estándar (Min)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-[10px]">
                        {center.d.length === 0 ? (
                          <tr><td colSpan={3} className="py-12 text-center text-gray-400 italic">Sin datos técnicos cargados</td></tr>
                        ) : (
                          center.d.map((t, i) => {
                            return (
                              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3 font-mono font-bold text-teal-700 border-r border-dashed border-gray-100">{String(t.CodMaterial || '').trim().slice(-8)}</td>
                                <td className="px-4 py-3 text-left border-r border-dashed border-gray-100 text-gray-500 uppercase truncate max-w-[200px]">{t.Material || t.Descripcion || '—'}</td>
                                <td className="px-4 py-3 font-mono font-black text-teal-600 bg-teal-50/5">{(t.Tiempo_Min || t.Tiempo || 0).toFixed(4)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};