'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { operationTracker } from '@/services/OperationTracker';
import { ClipboardList, Loader2, Search, Home, Database, LayoutGrid, AlertCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface OrdenFert {
  CENTRO: string;
  ORDEN: string;
  MATERIAL: string;
  SECTORDESC: string;
  CATEGORIA: string;
  NOMBRE: string;
  CANTPROGRAMADA: number;
  CANTENTREGADA: number;
  CANTNOTIFICADA: number;
  CANTRECHAZO: number;
  CANTPENDIENTE: number;
  UNIDAD: string;
  FECHA: string;
  ANIO: number;
  MES: number;
  DIA: number;
  SEMANA: number;
  RESPCTRLPROD: string;
  PRIORIDAD: number;
  ENLINEA: number;
  MAQUINA: string;
  PEDIDO: string;
  CANTPROGPESONETO: number;
  T_ARMADO?: number;
  T_CERRADO_L1?: number;
  T_CERRADO1_L2?: number;
  T_CERRADO2_L2?: number;
  T_CERRADO_L3?: number;
  ttArmado?: number;
  ttCerradoL1?: number;
  ttCerrado1L2?: number;
  ttCerrado2L2?: number;
  ttCerradoL3?: number;
  [key: string]: any;
}

export const OrdenesFertTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('OrdenesFertTab');
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  // Estados de Datos
  const [allRawOrders, setAllRawOrders] = useState<OrdenFert[]>([]);
  const [tiemposLookup, setTiemposLookup] = useState<Map<string, Record<string, number>>>(new Map());
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [restrictions, setRestrictions] = useState<any[]>([]);
  
  // Estados de UI
  const [selectedTab, setSelectedTab] = useState<string>("raw_view");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>("ALL");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const normalizeMaterialCode = (code: string | number): string => {
    return String(code || '').trim().slice(-8);
  };

  const loadData = useCallback(async () => {
    const opId = operationTracker.startOperation('FertOrders', 'data_load', 'Cargando Órdenes FERT');
    setIsLoading(true);
    
    try {
      // 1. Cargar Grupos y Centros
      const groupsRes = await grupoService.getAll();
      const groupsData = Array.isArray(groupsRes?.data) ? groupsRes.data : [];
      setGroups(groupsData);
      
      const centersFromGroups = [...new Set(groupsData.map((g: any) => String(g.centro).trim()))].sort();
      setAvailableCenters(centersFromGroups);

      // 2. Cargar Órdenes Fert
      operationTracker.updateOperation(opId, 'running', 'Consultando órdenes al servidor...');
      const firstPageRes = await serviciosService.getOrdenesFert(1, 10000);
      let orders: OrdenFert[] = Array.isArray(firstPageRes?.data) ? firstPageRes.data : [];
      
      setAllRawOrders(orders);
      operationTracker.updateOperation(opId, 'running', `Cargadas ${orders.length} órdenes.`);

      // 3. Cargar Tiempos Técnicos para cruce
      operationTracker.updateOperation(opId, 'running', 'Cruzando con Tiempos de Ensamblado...');
      const tiemposRes = await serviciosService.getTiemposEnsamblado(1, 10000);
      const lookup = new Map<string, Record<string, number>>();
      if (Array.isArray(tiemposRes?.data)) {
        tiemposRes.data.forEach((t: any) => {
          const key = `${String(t.Centro).trim()}|${normalizeMaterialCode(t.CodMaterial)}`;
          if (!lookup.has(key)) lookup.set(key, {});
          lookup.get(key)![String(t.PuestoTrabajo || '').trim().toUpperCase()] = Number(t.Tiempo_Min) || 0;
        });
      }
      setTiemposLookup(lookup);

      // 4. Cargar Restricciones
      const restRes = await restriccionService.getAll();
      setRestrictions(restRes?.data || []);

      operationTracker.completeOperation(opId, `Carga finalizada con ${orders.length} registros enriquecidos.`);
      inspector.captureVariable('fert_total_loaded', orders.length);

    } catch (err) {
      const msg = (err as Error).message;
      operationTracker.failOperation(opId, msg);
      addNotification('error', `Error en carga de órdenes: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      loadData();
    }
  }, [loadData]);

  const getResponsablesPorCentro = (centerId: string) => {
    const group = groups.find(g => String(g.centro).trim() === centerId);
    if (!group) return [];
    const rest = restrictions.find(r => r.codigo_grupo === group.codigo_grupo && r.nombre_restriccion === 'RespCtrlProd');
    if (!rest) return [];
    return rest.valor_restriccion.split(/[,&]/).map((v: string) => v.trim()).filter(Boolean);
  };

  // Enriquecimiento y Agrupación por Centro
  const filteredDataByCenter = useMemo(() => {
    const grouped: Record<string, OrdenFert[]> = {};
    
    availableCenters.forEach(centerId => {
      let centerOrders = allRawOrders.filter(o => String(o.CENTRO || '').trim() === centerId);

      const allowedResps = getResponsablesPorCentro(centerId);
      if (allowedResps.length > 0) {
        centerOrders = centerOrders.filter(o => allowedResps.includes(String(o.RESPCTRLPROD).trim()));
      }

      grouped[centerId] = centerOrders.map(order => {
        const matCode = normalizeMaterialCode(order.MATERIAL);
        const materialKey = `${centerId}|${matCode}`;
        const times = tiemposLookup.get(materialKey) || {};
        const catSuffix = String(order.CATEGORIA || '').trim().slice(-2).toUpperCase();
        const pend = Number(order.CANTPENDIENTE || 0);

        const tArmado = times['ARMADO'] || 0;
        const tCerradoL1 = catSuffix === 'L1' ? (times['CERRADO L1'] || 0) : 0;
        const tCerrado1L2 = catSuffix === 'L2' ? (times['CERRADO1 L2'] || 0) : 0;
        const tCerrado2L2 = catSuffix === 'L2' ? (times['CERRADO2 L2'] || 0) : 0;
        const tCerradoL3 = catSuffix === 'L3' ? (times['CERRADO L3'] || 0) : 0;

        return {
          ...order,
          T_ARMADO: tArmado,
          T_CERRADO_L1: tCerradoL1,
          T_CERRADO1_L2: tCerrado1L2,
          T_CERRADO2_L2: tCerrado2L2,
          T_CERRADO_L3: tCerradoL3,
          ttArmado: tArmado * pend,
          ttCerradoL1: tCerradoL1 * pend,
          ttCerrado1L2: tCerrado1L2 * pend,
          ttCerrado2L2: tCerrado2L2 * pend,
          ttCerradoL3: tCerradoL3 * pend,
        };
      });
    });

    return grouped;
  }, [allRawOrders, availableCenters, groups, restrictions, tiemposLookup]);

  // Filtros aplicados a la vista actual
  const currentViewOrders = useMemo(() => {
    const base = selectedTab === "raw_view" ? allRawOrders : (filteredDataByCenter[selectedTab] || []);
    const term = searchTerm.toLowerCase().trim();
    
    return base.filter(o => {
      if (selectedSector !== "ALL" && String(o.SECTORDESC || '').toUpperCase() !== selectedSector) return false;
      
      if (term) {
        const matches = [o.ORDEN, o.MATERIAL, o.NOMBRE, o.PEDIDO].some(v => String(v || '').toLowerCase().includes(term));
        if (!matches) return false;
      }

      for (const [key, value] of Object.entries(colFilters)) {
        if (!value || value === "ALL") continue;
        if (String(o[key] || '').trim() !== value) return false;
      }

      return true;
    });
  }, [allRawOrders, filteredDataByCenter, selectedTab, searchTerm, selectedSector, colFilters]);

  const colOptions = useMemo(() => {
    const base = selectedTab === "raw_view" ? allRawOrders : (filteredDataByCenter[selectedTab] || []);
    const getUnique = (key: string) => [...new Set(base.map(o => String(o[key] || '').trim()))].sort();
    return {
      CENTRO: getUnique('CENTRO'),
      MAQUINA: getUnique('MAQUINA'),
      MATERIAL: getUnique('MATERIAL'),
      FECHA: getUnique('FECHA').sort((a, b) => new Date(a).getTime() - new Date(b).getTime()),
    };
  }, [allRawOrders, filteredDataByCenter, selectedTab]);

  const totals = useMemo(() => {
    return currentViewOrders.reduce((acc, o) => {
      acc.prog += Number(o.CANTPROGRAMADA || 0);
      acc.entreg += Number(o.CANTENTREGADA || 0);
      acc.noti += Number(o.CANTNOTIFICADA || 0);
      acc.ttArm += Number(o.ttArmado || 0);
      acc.ttL1 += Number(o.ttCerradoL1 || 0);
      acc.tt1L2 += Number(o.ttCerrado1L2 || 0);
      acc.tt2L2 += Number(o.ttCerrado2L2 || 0);
      acc.ttL3 += Number(o.ttCerradoL3 || 0);
      return acc;
    }, { prog: 0, entreg: 0, noti: 0, ttArm: 0, ttL1: 0, tt1L2: 0, tt2L2: 0, ttL3: 0 });
  }, [currentViewOrders]);

  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const totalPagesLocal = Math.max(1, Math.ceil(currentViewOrders.length / rowsPerPage));
  const displayedOrders = currentViewOrders.slice(startIndex, endIndex);

  const handleFilter = (key: string, val: string) => {
    setColFilters(prev => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <ClipboardList className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Órdenes FERT</h3>
            <p className="text-xs text-gray-500 mt-1">Gestión de órdenes con tiempos técnicos por estación</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedSector} onValueChange={setSelectedSector}>
            <SelectTrigger className="h-9 w-56 bg-white"><LayoutGrid className="w-3.5 h-3.5 mr-2 text-gray-400" /><SelectValue placeholder="Sector" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los Sectores</SelectItem>
              {[...new Set(allRawOrders.map(o => String(o.SECTORDESC || 'N/A').trim().toUpperCase()))].sort().map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input type="search" placeholder="Orden, material, pedido..." className="pl-9 h-9 text-xs" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
          </div>
          <Button variant="outline" size="sm" onClick={() => { hasStarted.current = false; loadData(); }}>Actualizar</Button>
        </div>
      </div>

      {isLoading && allRawOrders.length === 0 ? (
        <div className="flex flex-col justify-center items-center py-20 bg-white rounded-lg border border-dashed">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <span className="mt-4 text-gray-600 font-medium">Cargando datos...</span>
        </div>
      ) : (
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto bg-gray-100/50 p-1 mb-4">
            <TabsTrigger value="raw_view" className="data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800 px-4 py-2 text-xs font-bold uppercase tracking-wider border-r border-gray-200">
              <Database className="w-3 h-3 mr-2" /> VISTA BRUTA ({allRawOrders.length})
            </TabsTrigger>
            {availableCenters.map(center => (
              <TabsTrigger key={center} value={center} className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 px-6 py-2 text-xs font-bold uppercase tracking-wider">
                <Home className="w-3 h-3 mr-2" /> Centro {center} ({filteredDataByCenter[center]?.length || 0})
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
              <div style={{ transform: 'rotateX(180deg)' }}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[100px]">Centro</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[100px]">Máquina</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[100px]">Material</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[120px]">Fecha</th>
                      <th colSpan={2} className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Orden / Nombre</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-gray-700 uppercase bg-gray-100/50 min-w-[60px]">PROG</th>
                      <th className="px-3 py-3 text-right text-green-700 uppercase bg-green-50/30 min-w-[60px]">ENTREG</th>
                      <th className="px-3 py-3 text-right text-blue-600 uppercase bg-blue-50/30 min-w-[60px]">NOTI</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50/50">TT ARMADO</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50/50">TT CERRADO L1</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50/50">TTCERRADO1 L2</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50/50">TTCERRADO2 L2</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50/50">TTCERRADO L3</th>
                    </tr>
                    <tr className="bg-gray-100/50">
                      <th className="px-2 py-2"><select className="w-full text-[10px] border rounded h-7" value={colFilters.CENTRO || "ALL"} onChange={e => handleFilter('CENTRO', e.target.value)}><option value="ALL">CENTRO</option>{colOptions.CENTRO.map(v => <option key={v} value={v}>{v}</option>)}</select></th>
                      <th className="px-2 py-2"><select className="w-full text-[10px] border rounded h-7" value={colFilters.MAQUINA || "ALL"} onChange={e => handleFilter('MAQUINA', e.target.value)}><option value="ALL">MÁQUINA</option>{colOptions.MAQUINA.map(v => <option key={v} value={v}>{v}</option>)}</select></th>
                      <th className="px-2 py-2"><select className="w-full text-[10px] border rounded h-7" value={colFilters.MATERIAL || "ALL"} onChange={e => handleFilter('MATERIAL', e.target.value)}><option value="ALL">MATERIAL</option>{colOptions.MATERIAL.map(v => <option key={v} value={v}>{v}</option>)}</select></th>
                      <th className="px-2 py-2"><select className="w-full text-[10px] border rounded h-7" value={colFilters.FECHA || "ALL"} onChange={e => handleFilter('FECHA', e.target.value)}><option value="ALL">FECHA</option>{colOptions.FECHA.map(v => <option key={v} value={v}>{v}</option>)}</select></th>
                      <th colSpan={10}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayedOrders.length > 0 ? displayedOrders.map((o, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 text-[10px]">
                        <td className="px-3 py-2 font-bold text-gray-500">{o.CENTRO}</td>
                        <td className="px-3 py-2 font-mono">{o.MAQUINA || '-'}</td>
                        <td className="px-3 py-2 font-mono">{o.MATERIAL}</td>
                        <td className="px-3 py-2 text-gray-500">{o.FECHA}</td>
                        <td className="px-3 py-2 font-bold text-indigo-600">{o.ORDEN}</td>
                        <td className="px-3 py-2 text-gray-600 truncate max-w-[150px]">{o.NOMBRE}</td>
                        <td className="px-3 py-2 text-right font-bold">{o.CANTPROGRAMADA}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-600">{o.CANTENTREGADA}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-600">{o.CANTNOTIFICADA}</td>
                        <td className="px-4 py-2 text-right font-bold text-emerald-700">{o.ttArmado?.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right font-bold text-emerald-700">{o.ttCerradoL1?.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right font-bold text-emerald-700">{o.ttCerrado1L2?.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right font-bold text-emerald-700">{o.ttCerrado2L2?.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right font-bold text-emerald-700">{o.ttCerradoL3?.toFixed(1)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={14} className="px-6 py-12 text-center text-gray-400 italic">No se encontraron órdenes para los criterios seleccionados.</td></tr>
                    )}
                  </tbody>
                  <tfoot className="bg-gray-800 text-white font-bold text-[10px] sticky bottom-0 z-10">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-right uppercase border-r border-gray-700">TOTALES FILTRADOS:</td>
                      <td className="px-3 py-3 text-right">{totals.prog.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-green-300">{totals.entreg.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-blue-300 border-r border-gray-700">{totals.noti.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-emerald-300">{totals.ttArm.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right text-emerald-300">{totals.ttL1.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right text-emerald-300">{totals.tt1L2.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right text-emerald-300">{totals.tt2L2.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right text-emerald-300">{totals.ttL3.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs">
                <span className="font-medium text-gray-500 uppercase">Mostrar:</span>
                <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="border rounded p-1 bg-white">
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-gray-400">{startIndex + 1} - {Math.min(endIndex, currentViewOrders.length)} de {currentViewOrders.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Ant.</Button>
                <div className="px-4 py-1 bg-white border rounded text-xs font-bold text-indigo-600 min-w-[80px] text-center">{currentPage} / {totalPagesLocal}</div>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPagesLocal, p + 1))} disabled={currentPage === totalPagesLocal}>Sig.</Button>
              </div>
            </div>
          </div>
        </Tabs>
      )}
    </div>
  );
};