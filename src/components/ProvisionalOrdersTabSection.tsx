'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { Package, Loader2, Home, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProvisionalOrder {
  ORDENPREVISIONAL: string;
  MATERIAL: string;
  NOMBRE: string;
  CATEGORIA: string;
  CANTIDAD: number;
  UNIDAD: string;
  FECHAINICIO: string;
  FECHAFIN: string;
  RESPCONTROLPROD: string;
  Centro: string;
  Almacen: string;
  Maquina: string | null;
  ClaseOrden: string;
  CodMaterial: string;
  T_ARMADO?: number;
  T_CERRADO_L1?: number;
  T_CERRADO1_L2?: number;
  T_CERRADO2_L2?: number;
  T_CERRADO_L3?: number;
}

export const ProvisionalOrdersTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('ProvisionalOrdersTab');
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  const [orders, setOrders] = useState<ProvisionalOrder[]>([]);
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const normalizeMaterialCode = (code: string | number): string => {
    return String(code || '').trim().slice(-8);
  };

  const loadData = useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    try {
      setIsLoading(true);
      
      const [groupsRes, pageResponse, tiemposRes] = await Promise.all([
        grupoService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 10000),
        serviciosService.getTiemposEnsamblado(1, 10000)
      ]);

      const centersFromGroups = [...new Set((groupsRes?.data || []).map((g: any) => String(g.centro).trim()))].sort();
      setAvailableCenters(centersFromGroups);

      // Crear mapa de búsqueda para tiempos técnicos por estación
      const lookup = new Map<string, Record<string, number>>();
      const tiemposData = Array.isArray(tiemposRes?.data) ? tiemposRes.data : [];
      
      tiemposData.forEach((t: any) => {
        const materialKey = `${String(t.Centro).trim()}|${normalizeMaterialCode(t.CodMaterial)}`;
        const stationName = String(t.PuestoTrabajo || '').trim().toUpperCase();
        const time = Number(t.Tiempo_Min) || 0;
        
        if (!lookup.has(materialKey)) {
          lookup.set(materialKey, {});
        }
        lookup.get(materialKey)![stationName] = time;
      });

      if (pageResponse && pageResponse.data) {
        const rawOrders = Array.isArray(pageResponse.data) ? pageResponse.data : [];
        const enriched = rawOrders.map(order => {
          const materialKey = `${String(order.Centro).trim()}|${normalizeMaterialCode(order.CodMaterial || order.MATERIAL)}`;
          const times = lookup.get(materialKey) || {};
          
          // Lógica de validación por sufijo de Categoría (L1, L2, L3)
          const catSuffix = String(order.CATEGORIA || '').trim().slice(-2).toUpperCase();
          
          return {
            ...order,
            T_ARMADO: times['ARMADO'] || 0,
            T_CERRADO_L1: catSuffix === 'L1' ? (times['CERRADO L1'] || 0) : 0,
            T_CERRADO1_L2: catSuffix === 'L2' ? (times['CERRADO1 L2'] || 0) : 0,
            T_CERRADO2_L2: catSuffix === 'L2' ? (times['CERRADO2 L2'] || 0) : 0,
            T_CERRADO_L3: catSuffix === 'L3' ? (times['CERRADO L3'] || 0) : 0,
          };
        });
        setOrders(enriched);
      }
      
      if (centersFromGroups.length > 0) {
        setSelectedCenter(centersFromGroups[0]);
      }
    } catch (err) {
      addNotification('error', `Error al cargar datos: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentCenterOrders = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return orders.filter(order => {
      const almacen = String(order.Almacen || '').trim();
      if (almacen !== '1001' && almacen !== '2001') return false;

      if (String(order.Centro || '').trim() !== selectedCenter) return false;

      if (term) {
        return (
          String(order.ORDENPREVISIONAL || '').toLowerCase().includes(term) ||
          String(order.CodMaterial || order.MATERIAL || '').toLowerCase().includes(term) ||
          String(order.NOMBRE || '').toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [orders, searchTerm, selectedCenter]);

  const totalPagesLocal = Math.max(1, Math.ceil(currentCenterOrders.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedOrders = currentCenterOrders.slice(startIndex, endIndex);

  const formatMaterial = (mat: string) => String(mat || '').replace(/^0+/, '');

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center py-20 bg-white rounded-lg border border-dashed">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        <span className="mt-4 text-gray-600 font-medium">Cargando órdenes previsionales...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Package className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-700">Órdenes Previsionales</h3>
            <p className="text-xs text-gray-500">Centros operativos oficiales</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Buscar..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>
      </div>

      <Tabs value={selectedCenter} onValueChange={(val) => { setSelectedCenter(val); setCurrentPage(1); }} className="w-full">
        <TabsList className="flex flex-wrap h-auto bg-gray-100/50 p-1 mb-4">
          {availableCenters.map(center => (
            <TabsTrigger 
              key={center} 
              value={center}
              className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider"
            >
              <Home className="w-3 h-3 mr-2" />
              Centro {center}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
            <div style={{ transform: 'rotateX(180deg)' }}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Orden</th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Material</th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nombre</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/30">Armado</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/30">Cerrado L1</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/30">Cerrado1 L2</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/30">Cerrado2 L2</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/30">Cerrado L3</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cantidad</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50/30">TT Armado</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50/30">TT Cerrado L1</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50/30">TT Cerrado1 L2</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50/30">TT Cerrado2 L2</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50/30">TT Cerrado L3</th>
                    <th className="px-6 py-3 text-center text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/30">Almacén</th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Resp. Ctrl.</th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">F. Inicio</th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Máquina</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {displayedOrders.length > 0 ? displayedOrders.map((order, idx) => {
                    const qty = Number(order.CANTIDAD || 0);
                    const ttArmado = (order.T_ARMADO || 0) * qty;
                    const ttCerradoL1 = (order.T_CERRADO_L1 || 0) * qty;
                    const ttCerrado1L2 = (order.T_CERRADO1_L2 || 0) * qty;
                    const ttCerrado2L2 = (order.T_CERRADO2_L2 || 0) * qty;
                    const ttCerradoL3 = (order.T_CERRADO_L3 || 0) * qty;

                    return (
                      <tr key={`${order.ORDENPREVISIONAL}-${idx}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600 font-mono">{order.ORDENPREVISIONAL}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{formatMaterial(order.CodMaterial || order.MATERIAL)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={order.NOMBRE}>{order.NOMBRE}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_ARMADO ? order.T_ARMADO.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_CERRADO_L1 ? order.T_CERRADO_L1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_CERRADO1_L2 ? order.T_CERRADO1_L2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_CERRADO2_L2 ? order.T_CERRADO2_L2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_CERRADO_L3 ? order.T_CERRADO_L3.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-600">{qty.toLocaleString()}</td>
                        
                        {/* TT Columns */}
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-emerald-700 bg-emerald-50/10">
                          {ttArmado > 0 ? ttArmado.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-emerald-700 bg-emerald-50/10">
                          {ttCerradoL1 > 0 ? ttCerradoL1.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-emerald-700 bg-emerald-50/10">
                          {ttCerrado1L2 > 0 ? ttCerrado1L2.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-emerald-700 bg-emerald-50/10">
                          {ttCerrado2L2 > 0 ? ttCerrado2L2.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-right text-emerald-700 bg-emerald-50/10">
                          {ttCerradoL3 > 0 ? ttCerradoL3.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-bold text-indigo-700 bg-indigo-50/10">{order.Almacen}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{order.RESPCONTROLPROD}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{order.FECHAINICIO}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono text-xs">{order.Maquina || '-'}</td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={18} className="px-6 py-12 text-center text-gray-400 italic">
                        No se encontraron órdenes para el centro {selectedCenter}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gray-50 px-6 py-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-gray-500 uppercase">Ver:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="text-sm border rounded p-1 bg-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span className="text-xs text-gray-400 font-medium">
                Viendo {startIndex + 1} - {Math.min(endIndex, currentCenterOrders.length)} de {currentCenterOrders.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}> Anterior </Button>
              <div className="px-4 py-1 bg-white border rounded text-sm font-bold text-indigo-600 min-w-[80px] text-center"> {currentPage} / {totalPagesLocal} </div>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPagesLocal, p + 1))} disabled={currentPage === totalPagesLocal}> Siguiente </Button>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
};