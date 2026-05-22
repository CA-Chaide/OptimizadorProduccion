'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { dataStore } from '@/services/DataStore';
import { ClipboardList, Loader2, Search, Home, Database, LayoutGrid, UserCheck, AlertCircle, ChevronDown } from 'lucide-react';
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

interface TiempoTecnico {
  CodMaterial: string;
  Centro: string;
  PuestoTrabajo: string;
  Tiempo_Min: number;
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
  
  // Filtros por columna
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const normalizeMaterialCode = (code: string | number): string => {
    return String(code || '').trim().slice(-8);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log('[OrdenesFert] Iniciando carga de datos...');
      const exploratoryRes = await serviciosService.getOrdenesFert(1, 1);
      const total = exploratoryRes.totalRegistros || 0;
      
      let allOrders: OrdenFert[] = [];
      
      if (total > 0) {
        const BATCH_SIZE = 10000;
        const totalPages = Math.ceil(total / BATCH_SIZE);
        
        for (let i = 1; i <= totalPages; i++) {
          console.log(`[OrdenesFert] Descargando bloque ${i} de ${totalPages}...`);
          const res = await serviciosService.getOrdenesFert(i, BATCH_SIZE);
          if (res?.data) {
            const pageData = Array.isArray(res.data) ? res.data : [res.data];
            allOrders = [...allOrders, ...pageData];
          }
        }
      }

      // Cargar tiempos de ensamblado para el cruce
      const tiemposRes = await serviciosService.getTiemposEnsamblado(1, 10000);
      const tiemposData: TiempoTecnico[] = Array.isArray(tiemposRes?.data) ? tiemposRes.data : [];
      
      const lookup = new Map<string, Record<string, number>>();
      tiemposData.forEach(t => {
        const materialKey = `${String(t.Centro).trim()}|${normalizeMaterialCode(t.CodMaterial)}`;
        const stationName = String(t.PuestoTrabajo || '').trim().toUpperCase();
        const time = Number(t.Tiempo_Min) || 0;
        
        if (!lookup.has(materialKey)) {
          lookup.set(materialKey, {});
        }
        lookup.get(materialKey)![stationName] = time;
      });
      setTiemposLookup(lookup);

      const [groupsRes, restRes] = await Promise.all([
        grupoService.getAll(),
        restriccionService.getAll()
      ]);

      setAllRawOrders(allOrders);
      setGroups(groupsRes?.data || []);
      setRestrictions(restRes?.data || []);

      const centersFromGroups = [...new Set((groupsRes?.data || []).map((g: any) => String(g.centro).trim()))].sort();
      setAvailableCenters(centersFromGroups);
      
      inspector.captureVariable('fert_raw_count', allOrders.length);
    } catch (err) {
      addNotification('error', `Error al cargar y cruzar datos: ${(err as Error).message}`);
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

  const parseResponsables = (value: string): string[] => {
    if (!value) return [];
    return value.split(/[,&]/).map(v => v.trim()).filter(Boolean);
  };

  const getResponsablesPorCentro = (centerId: string) => {
    const groupForCenter = groups.find(g => String(g.centro).trim() === centerId);
    if (!groupForCenter) return [];
    const restriction = restrictions.find(r => 
      r.codigo_grupo === groupForCenter.codigo_grupo && 
      r.nombre_restriccion === 'RespCtrlProd'
    );
    return parseResponsables(restriction?.valor_restriccion || '');
  };

  const filteredDataByCenter = useMemo(() => {
    const grouped: Record<string, OrdenFert[]> = {};
    
    availableCenters.forEach(centerId => {
      let centerOrders = allRawOrders.filter(order => String(order.CENTRO || '').trim() === centerId);

      const allowedResps = getResponsablesPorCentro(centerId);
      if (allowedResps.length > 0) {
        centerOrders = centerOrders.filter(order => 
          allowedResps.includes(String(order.RESPCTRLPROD).trim())
        );
      }

      const enrichedOrders = centerOrders.map(order => {
        const materialKey = `${centerId}|${normalizeMaterialCode(order.MATERIAL)}`;
        const stations = tiemposLookup.get(materialKey) || {};
        const catSuffix = String(order.CATEGORIA || '').trim().slice(-2).toUpperCase();
        const pend = Number(order.CANTPENDIENTE || 0);

        // Unit Times
        const tArmado = stations['ARMADO'] || 0;
        const tCerradoL1 = catSuffix === 'L1' ? (stations['CERRADO L1'] || 0) : 0;
        const tCerrado1L2 = catSuffix === 'L2' ? (stations['CERRADO1 L2'] || 0) : 0;
        const tCerrado2L2 = catSuffix === 'L2' ? (stations['CERRADO2 L2'] || 0) : 0;
        const tCerradoL3 = catSuffix === 'L3' ? (stations['CERRADO L3'] || 0) : 0;

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

      grouped[centerId] = enrichedOrders;
    });

    return grouped;
  }, [allRawOrders, availableCenters, groups, restrictions, tiemposLookup]);

  // PUBLICAR DATOS EN EL DATASTORE PARA "PROG DIARIA"
  useEffect(() => {
    if (filteredDataByCenter) {
      const allProcessed = Object.values(filteredDataByCenter).flat();
      if (allProcessed.length > 0) {
        dataStore.setData('ordenesFert', allProcessed, 'OrdenesFertTab', {
          count: allProcessed.length,
          lastProcessed: new Date()
        });
      }
    }
  }, [filteredDataByCenter]);

  const availableSectors = useMemo(() => {
    const baseOrders = selectedTab === "raw_view" 
      ? allRawOrders 
      : (filteredDataByCenter[selectedTab] || []);
    return [...new Set(baseOrders.map(o => String(o.SECTORDESC || 'SIN SECTOR').trim().toUpperCase()))].sort();
  }, [allRawOrders, filteredDataByCenter, selectedTab]);

  const currentViewOrders = useMemo(() => {
    let base = selectedTab === "raw_view" 
      ? allRawOrders 
      : (filteredDataByCenter[selectedTab] || []);

    const term = searchTerm.toLowerCase().trim();
    
    return base.filter(o => {
      // Filtro global
      if (selectedSector !== "ALL") {
        if (String(o.SECTORDESC || 'SIN SECTOR').trim().toUpperCase() !== selectedSector) return false;
      }
      if (term) {
        const matchTerm = (
          String(o.ORDEN || '').toLowerCase().includes(term) ||
          String(o.MATERIAL || '').toLowerCase().includes(term) ||
          String(o.NOMBRE || '').toLowerCase().includes(term) ||
          String(o.PEDIDO || '').toLowerCase().includes(term)
        );
        if (!matchTerm) return false;
      }

      // Filtros por columna
      for (const [key, value] of Object.entries(colFilters)) {
        if (!value) continue;
        const valStr = String(o[key] || '').toLowerCase();
        if (!valStr.includes(value.toLowerCase())) return false;
      }

      return true;
    });
  }, [allRawOrders, filteredDataByCenter, selectedTab, searchTerm, selectedSector, colFilters]);

  // Totales de la vista filtrada
  const totals = useMemo(() => {
    return currentViewOrders.reduce((acc, o) => {
      acc.prog += Number(o.CANTPROGRAMADA || 0);
      acc.entreg += Number(o.CANTENTREGADA || 0);
      acc.notif += Number(o.CANTNOTIFICADA || 0);
      acc.rech += Number(o.CANTRECHAZO || 0);
      acc.pend += Number(o.CANTPENDIENTE || 0);
      acc.tArm += Number(o.T_ARMADO || 0);
      acc.tL1 += Number(o.T_CERRADO_L1 || 0);
      acc.t1L2 += Number(o.T_CERRADO1_L2 || 0);
      acc.t2L2 += Number(o.T_CERRADO2_L2 || 0);
      acc.tL3 += Number(o.T_CERRADO_L3 || 0);
      acc.ttArm += Number(o.ttArmado || 0);
      acc.ttL1 += Number(o.ttCerradoL1 || 0);
      acc.tt1L2 += Number(o.ttCerrado1L2 || 0);
      acc.tt2L2 += Number(o.ttCerrado2L2 || 0);
      acc.ttL3 += Number(o.ttCerradoL3 || 0);
      return acc;
    }, {
      prog: 0, entreg: 0, notif: 0, rech: 0, pend: 0,
      tArm: 0, tL1: 0, t1L2: 0, t2L2: 0, tL3: 0,
      ttArm: 0, ttL1: 0, tt1L2: 0, tt2L2: 0, ttL3: 0
    });
  }, [currentViewOrders]);

  const totalPagesLocal = Math.max(1, Math.ceil(currentViewOrders.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedOrders = currentViewOrders.slice(startIndex, endIndex);

  const formatMaterial = (mat: string) => String(mat || '').replace(/^0+/, '');

  const handleColFilterChange = (key: string, value: string) => {
    setColFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <ClipboardList className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Órdenes FERT</h3>
            <p className="text-xs text-gray-500 mt-1">Cruce con Tiempos de Ensamblado por Centro y Material</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <Select value={selectedSector} onValueChange={(val) => { setSelectedSector(val); setCurrentPage(1); }}>
              <SelectTrigger className="h-9 bg-white">
                <LayoutGrid className="w-3.5 h-3.5 mr-2 text-gray-400" />
                <SelectValue placeholder="Sector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los Sectores</SelectItem>
                {availableSectors.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Orden, material, pedido..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => { hasStarted.current = false; loadData(); }}>
            Actualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col justify-center items-center py-20 bg-white rounded-lg border border-dashed">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <span className="mt-4 text-gray-600 font-medium">Sincronizando órdenes y tiempos...</span>
        </div>
      ) : (
        <Tabs value={selectedTab} onValueChange={(val) => { setSelectedTab(val); setCurrentPage(1); setSelectedSector("ALL"); setColFilters({}); }} className="w-full">
          <TabsList className="flex flex-wrap h-auto bg-gray-100/50 p-1 mb-4">
            <TabsTrigger 
              value="raw_view"
              className="data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800 px-4 py-2 text-xs font-bold uppercase tracking-wider border-r border-gray-200"
            >
              <Database className="w-3 h-3 mr-2" />
              Vista Bruta ({allRawOrders.length})
            </TabsTrigger>
            
            {availableCenters.map(center => (
              <TabsTrigger 
                key={center} 
                value={center}
                className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider"
              >
                <Home className="w-3 h-3 mr-2" />
                Centro {center} ({filteredDataByCenter[center]?.length || 0})
              </TabsTrigger>
            ))}
          </TabsList>

          {selectedTab !== "raw_view" && (
            <div className="mb-4 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-3">
              <UserCheck className="w-5 h-5 text-indigo-600 shrink-0" />
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold text-indigo-800 uppercase tracking-tight">Responsables Filtrados:</span>
                {(() => {
                  const resps = getResponsablesPorCentro(selectedTab);
                  return resps.length > 0 ? (
                    resps.map(r => (
                      <Badge key={r} variant="secondary" className="bg-indigo-100 text-indigo-700 text-[10px] font-mono border-indigo-200">
                        {r}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[10px] text-indigo-400 italic">Sin restricción de responsables activa</span>
                  );
                })()}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
              <div style={{ transform: 'rotateX(180deg)' }}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[60px]">Centro</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[100px]">Máquina</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[100px]">Orden</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[100px]">Material</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[100px]">Categoría</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[200px]">Nombre</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase bg-indigo-50/50 min-w-[80px]">Armado</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase bg-indigo-50/50 min-w-[80px]">Cerrado L1</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase bg-indigo-50/50 min-w-[80px]">Cerrado1 L2</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase bg-indigo-50/50 min-w-[80px]">Cerrado2 L2</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase bg-indigo-50/50 min-w-[80px]">Cerrado L3</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-gray-700 uppercase bg-gray-100/50 min-w-[60px]">Prog.</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-gray-700 uppercase bg-gray-100/50 min-w-[60px]">Entreg.</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-blue-600 uppercase bg-blue-50/30 min-w-[60px]">Notif.</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-red-600 uppercase bg-red-50/30 min-w-[60px]">Rech.</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-amber-600 uppercase bg-amber-50/20 min-w-[60px]">Pend.</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50/50 min-w-[90px]">TT Armado</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50/50 min-w-[90px]">TT Cerrado L1</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50/50 min-w-[90px]">TT Cerrado1 L2</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50/50 min-w-[90px]">TT Cerrado2 L2</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50/50 min-w-[90px] border-r border-emerald-100">TT Cerrado L3</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[80px]">Resp.</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[120px]">Sector</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[50px]">Pri.</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider min-w-[100px]">Fecha</th>
                    </tr>
                    {/* Fila de Filtros */}
                    <tr className="bg-gray-100/30">
                      <th className="px-1 py-1"><Input className="h-7 text-[10px]" value={colFilters.CENTRO || ''} onChange={e => handleColFilterChange('CENTRO', e.target.value)} /></th>
                      <th className="px-1 py-1"><Input className="h-7 text-[10px]" value={colFilters.MAQUINA || ''} onChange={e => handleColFilterChange('MAQUINA', e.target.value)} /></th>
                      <th className="px-1 py-1"><Input className="h-7 text-[10px]" value={colFilters.ORDEN || ''} onChange={e => handleColFilterChange('ORDEN', e.target.value)} /></th>
                      <th className="px-1 py-1"><Input className="h-7 text-[10px]" value={colFilters.MATERIAL || ''} onChange={e => handleColFilterChange('MATERIAL', e.target.value)} /></th>
                      <th className="px-1 py-1"><Input className="h-7 text-[10px]" value={colFilters.CATEGORIA || ''} onChange={e => handleColFilterChange('CATEGORIA', e.target.value)} /></th>
                      <th className="px-1 py-1"><Input className="h-7 text-[10px]" value={colFilters.NOMBRE || ''} onChange={e => handleColFilterChange('NOMBRE', e.target.value)} /></th>
                      <th colSpan={19} className="bg-gray-50/20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayedOrders.length > 0 ? displayedOrders.map((order, idx) => (
                      <tr key={`${order.ORDEN}-${idx}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-4 whitespace-nowrap text-[10px] font-bold text-gray-400">{order.CENTRO}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-[10px] text-gray-500 font-mono">{order.MAQUINA || '-'}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-mono font-bold text-indigo-600">{order.ORDEN}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-mono text-gray-600">{formatMaterial(order.MATERIAL)}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-[10px] text-gray-500">{order.CATEGORIA}</td>
                        <td className="px-3 py-4 text-xs text-gray-600 max-w-xs truncate font-medium" title={order.NOMBRE}>{order.NOMBRE}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_ARMADO ? order.T_ARMADO.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_CERRADO_L1 ? order.T_CERRADO_L1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_CERRADO1_L2 ? order.T_CERRADO1_L2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_CERRADO2_L2 ? order.T_CERRADO2_L2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_CERRADO_L3 ? order.T_CERRADO_L3.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-gray-900">{order.CANTPROGRAMADA}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-green-600">{order.CANTENTREGADA}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-blue-600 bg-blue-50/30">{order.CANTNOTIFICADA}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-red-600 bg-red-50/30">{order.CANTRECHAZO}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-amber-600 bg-amber-50/20">{order.CANTPENDIENTE}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-emerald-700 bg-emerald-50/10">
                          {order.ttArmado ? order.ttArmado.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-emerald-700 bg-emerald-50/10">
                          {order.ttCerradoL1 ? order.ttCerradoL1.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-emerald-700 bg-emerald-50/10">
                          {order.ttCerrado1L2 ? order.ttCerrado1L2.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-emerald-700 bg-emerald-50/10">
                          {order.ttCerrado2L2 ? order.ttCerrado2L2.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-emerald-700 bg-emerald-50/10 border-r border-emerald-100">
                          {order.ttCerradoL3 ? order.ttCerradoL3.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-center">
                          <Badge variant="outline" className="text-[10px] font-mono border-gray-100 bg-gray-50 text-gray-400">{order.RESPCTRLPROD}</Badge>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-center">
                          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-100 text-[10px] font-bold uppercase">
                            {order.SECTORDESC || 'SIN SECTOR'}
                          </span>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-center text-[10px] font-mono">{order.PRIORIDAD}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-[10px] text-center text-gray-600">{order.FECHA}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={25} className="px-6 py-12 text-center text-gray-400 italic">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <AlertCircle className="w-8 h-8 text-gray-300" />
                            <span>No se encontraron órdenes para los criterios seleccionados.</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {/* Fila de Sumatorias Totales */}
                  <tfoot className="bg-gray-800 text-white font-bold text-[10px] sticky bottom-0 z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.1)]">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-right uppercase tracking-wider border-r border-gray-700">TOTALES FILTRADOS:</td>
                      <td className="px-4 py-3 text-right text-indigo-300 font-mono">{totals.tArm.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right text-indigo-300 font-mono">{totals.tL1.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right text-indigo-300 font-mono">{totals.t1L2.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right text-indigo-300 font-mono">{totals.t2L2.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right text-indigo-300 font-mono border-r border-gray-700">{totals.tL3.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
                      
                      <td className="px-3 py-3 text-right text-gray-300 font-mono">{totals.prog.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-green-300 font-mono">{totals.entreg.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-blue-300 font-mono">{totals.notif.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-red-300 font-mono">{totals.rech.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-amber-300 font-mono border-r border-gray-700">{totals.pend.toLocaleString()}</td>
                      
                      <td className="px-4 py-3 text-right text-emerald-300 font-mono">{totals.ttArm.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right text-emerald-300 font-mono">{totals.ttL1.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right text-emerald-300 font-mono">{totals.tt1L2.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right text-emerald-300 font-mono">{totals.tt2L2.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right text-emerald-300 font-mono border-r border-gray-700">{totals.ttL3.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs">
                <span className="font-medium text-gray-500 uppercase">Mostrar:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="border rounded p-1 bg-white"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-gray-400">
                  {startIndex + 1} - {Math.min(startIndex + rowsPerPage, currentViewOrders.length)} de {currentViewOrders.length}
                </span>
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