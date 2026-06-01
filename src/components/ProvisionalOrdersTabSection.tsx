'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { runtimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, RefreshCw, Search, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProvisionalOrder {
  [key: string]: any;
}

interface PaginationState {
  currentPage: number;
  totalRegistros: number;
  rows_per_page: number;
}

interface ProvisionalOrdersTabSectionProps {
  readonly externalFilters?: Record<string, string[]>;
  readonly renderCell?: (column: string, row: any) => React.ReactNode;
  readonly groupBy?: string;
  readonly resolveValue?: (col: string, row: any) => string;
}

export const ProvisionalOrdersTabSection: React.FC<ProvisionalOrdersTabSectionProps> = ({ 
  externalFilters, 
  renderCell,
  groupBy,
  resolveValue
}) => {
  const { addNotification } = useAppContext();
  const [isMounted, setIsMounted] = useState(false);
  const [orders, setOrders] = useState<ProvisionalOrder[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalRegistros: 0,
    rows_per_page: 20,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isInitialLoadDone = useRef(false);

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({
    MATERIAL: '',
    CATEGORIA: '',
    FECHAINICIO: '',
    RESPCONTROLPROD: '',
    MAQUINA: '',
    CODMATERIAL: '',
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const safeParseDateParts = useCallback((value: any) => {
    if (!value) return null;
    const str = String(value).trim();
    const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return { y: ymd[1], m: ymd[2], d: ymd[3] };
    const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) return { y: dmy[3], m: dmy[2].padStart(2, '0'), d: dmy[1].padStart(2, '0') };
    return null;
  }, []);

  const formatValueForDisplay = useCallback((col: string, value: any): string => {
    if (value === null || value === undefined || value === '') return '';
    const upperCol = col.toUpperCase().trim();
    
    if (upperCol.includes('FECHA')) {
      const parts = safeParseDateParts(value);
      if (parts) return `${parts.d}/${parts.m}/${parts.y}`;
      return String(value);
    }
    
    const num = parseFloat(value);
    if (!isNaN(num)) {
      if (upperCol.includes('TIEMPO') || upperCol === 'CANTIDAD' || upperCol === 'TAMLOTEMIN' || upperCol === 'TAMLOTEMAX') {
        return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }

    return String(value);
  }, [safeParseDateParts]);

  const handleColumnFilterChange = (column: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [column.toUpperCase()]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const fetchData = useCallback(async () => {
    if (isLoading) return;
    try {
      setIsLoading(true);
      const response = await serviciosService.OrdenesProvisionalesPaginados(1, 10000);
      let fetchedData = response.data || [];
      
      // Inyección de dato de prueba solicitado por el usuario
      const testRecord = {
        "ORDENPREVISIONAL": "0142465407",
        "MATERIAL": "000000000020003506",
        "NOMBRE": "PLANCHA ESPUMA D15 AMAR RR 140X200X1",
        "CATEGORIA": "CM-PL-15AM-RR",
        "CANTIDAD": 120,
        "UNIDAD": "ST",
        "FECHAINICIO": "2026-05-05",
        "FECHAFIN": "2026-06-09",
        "RESPCONTROLPROD": "018",
        "Centro": "1000",
        "Almacen": "1001",
        "Maquina": null,
        "ClaseOrden": "KD",
        "CodMaterial": "20003506"
      };

      // Verificar si ya existe para no duplicar en re-fetch
      if (!fetchedData.some((o: any) => o.ORDENPREVISIONAL === testRecord.ORDENPREVISIONAL)) {
        fetchedData = [testRecord, ...fetchedData];
      }

      setOrders(fetchedData);
      setPagination(prev => ({
        ...prev,
        totalRegistros: (response.totalRegistros || response.data.length) + 1,
        currentPage: 1
      }));
    } catch (err) {
      addNotification('error', `Error al cargar órdenes: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, isLoading]);

  useEffect(() => {
    if (isMounted && !isInitialLoadDone.current) {
      fetchData();
      isInitialLoadDone.current = true;
    }
  }, [fetchData, isMounted]);

  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (externalFilters && Object.keys(externalFilters).length > 0) {
      result = result.filter(order => {
        return Object.entries(externalFilters).every(([filterKey, allowedValues]) => {
          if (!allowedValues || allowedValues.length === 0) return true;
          const normFilterKey = filterKey.toUpperCase().trim();
          
          let orderValue = '';
          const orderKey = Object.keys(order).find(k => k.toUpperCase().trim() === normFilterKey);
          
          if (orderKey) {
            orderValue = String(order[orderKey] ?? '').trim().toUpperCase();
          } else if (resolveValue) {
            orderValue = String(resolveValue(normFilterKey, order) ?? '').trim().toUpperCase();
          }

          if (!orderValue || orderValue === '—') return false;
          return allowedValues.some(val => val.trim().toUpperCase() === orderValue);
        });
      });
    }

    result = result.filter(order => {
      return Object.entries(columnFilters).every(([filterKey, filterValue]) => {
        if (!filterValue) return true;
        const orderKey = Object.keys(order).find(k => k.toUpperCase().trim() === filterKey);
        
        let displayVal = '';
        if (orderKey) {
          displayVal = formatValueForDisplay(orderKey, order[orderKey]);
        } else if (resolveValue) {
          displayVal = resolveValue(filterKey, order);
        }

        return displayVal.toLowerCase().includes(filterValue.toLowerCase());
      });
    });

    if (groupBy) {
      const gCol = groupBy.toUpperCase().trim();
      result.sort((a, b) => {
        const valA = resolveValue ? resolveValue(gCol, a) : String(a[gCol] ?? '—');
        const valB = resolveValue ? resolveValue(gCol, b) : String(b[gCol] ?? '—');
        return valA.localeCompare(valB);
      });
    }

    return result;
  }, [orders, externalFilters, columnFilters, formatValueForDisplay, groupBy, resolveValue]);

  const columns = useMemo(() => {
    const priority = [
      'ORDENPREVISIONAL', 
      'FECHAINICIO', 
      'FECHAFIN', 
      'CATEGORIA', 
      'CodMaterial', 
      'NOMBRE', 
      'Maquina', 
      'CANTIDAD', 
      'UNIDAD', 
      'RESPCONTROLPROD', 
      'Centro', 
      'Almacen', 
      'ClaseOrden', 
      'MATERIAL'
    ];

    if (orders.length === 0) return priority;
    
    const allKeys = Object.keys(orders[0]);
    const usedKeysUpper = new Set<string>();
    const finalColumns: string[] = [];

    priority.forEach(pCol => {
      const pColUpper = pCol.toUpperCase().trim();
      if (usedKeysUpper.has(pColUpper)) return;

      const match = allKeys.find(k => k.toUpperCase().trim() === pColUpper);
      if (match) {
        finalColumns.push(match);
        usedKeysUpper.add(pColUpper);
      } else if (pColUpper === 'MAQUINA') {
        finalColumns.push('Maquina');
        usedKeysUpper.add('MAQUINA');
      }
    });

    allKeys.forEach(key => {
      const keyUpper = key.toUpperCase().trim();
      if (!usedKeysUpper.has(keyUpper)) {
        finalColumns.push(key);
        usedKeysUpper.add(keyUpper);
      }
    });

    return finalColumns;
  }, [orders]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pagination.rows_per_page));
  const displayedOrders = useMemo(() => {
    const start = (pagination.currentPage - 1) * pagination.rows_per_page;
    return filteredOrders.slice(start, start + pagination.rows_per_page);
  }, [filteredOrders, pagination.currentPage, pagination.rows_per_page]);

  if (!isMounted) return null;

  let lastGroupValue: string | null = null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
          <table className="min-w-full divide-y divide-gray-200 border-collapse">
            <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
              <tr>
                {columns.map((col, idx) => (
                  <th key={`head-${col}-${idx}`} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-gray-50 border-b text-gray-600">
                    {col}
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-50/50">
                {columns.map((col, idx) => {
                  const upperCol = col.toUpperCase().trim();
                  const isFilterable = ['MATERIAL', 'CATEGORIA', 'FECHAINICIO', 'RESPCONTROLPROD', 'MAQUINA', 'CODMATERIAL'].includes(upperCol);
                  return (
                    <th key={`filter-${col}-${idx}`} className="px-2 py-2 bg-gray-50 border-b border-gray-200">
                      {isFilterable ? (
                        <div className="relative">
                          <Search className="absolute left-2 top-1.5 h-3 w-3 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Buscar..."
                            value={columnFilters[upperCol] || ''}
                            onChange={(e) => handleColumnFilterChange(upperCol, e.target.value)}
                            className="w-full text-[10px] pl-7 pr-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-primary outline-none font-normal bg-white"
                          />
                        </div>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {isLoading && orders.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-24 text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-2" />
                    <span className="text-gray-500 font-medium">Consultando servidor...</span>
                  </td>
                </tr>
              ) : displayedOrders.length > 0 ? (
                displayedOrders.map((order, idx) => {
                  let groupHeader = null;
                  if (groupBy) {
                    const gCol = groupBy.toUpperCase().trim();
                    const currentGroupValue = resolveValue 
                      ? resolveValue(gCol, order) 
                      : String(order[gCol] ?? '—').trim() || '—';
                    
                    if (currentGroupValue !== lastGroupValue) {
                      lastGroupValue = currentGroupValue;
                      groupHeader = (
                        <tr key={`group-${currentGroupValue}-${idx}`} className="bg-indigo-50/60">
                          <td colSpan={columns.length} className="px-4 py-2 text-[11px] font-bold text-indigo-900 border-y border-indigo-100">
                            <div className="flex items-center gap-2"><Layers className="w-3 h-3" />{groupBy}: <span className="uppercase">{currentGroupValue}</span></div>
                          </td>
                        </tr>
                      );
                    }
                  }

                  const row = (
                    <tr key={`order-row-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                      {columns.map((col, cIdx) => {
                        if (renderCell) {
                          const rendered = renderCell(col, order);
                          if (rendered !== undefined) {
                            return <td key={`cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600">{rendered}</td>;
                          }
                        }
                        return <td key={`cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600">{formatValueForDisplay(col, order[col])}</td>;
                      })}
                    </tr>
                  );

                  return groupHeader ? [groupHeader, row] : row;
                }).flat()
              ) : (
                <tr><td colSpan={columns.length} className="py-20 text-center text-gray-400 italic bg-gray-50/50">No se encontraron registros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Filas:</span>
            <select
              value={pagination.rows_per_page}
              onChange={(e) => setPagination(prev => ({ ...prev, rows_per_page: Number(e.target.value), currentPage: 1 }))}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              {[20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">{filteredOrders.length} registros filtrados</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setPagination(prev => ({ ...prev, currentPage: 1 }))} disabled={pagination.currentPage === 1} className="h-8 w-8"><ChevronsLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))} disabled={pagination.currentPage === 1} className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button>
            <div className="px-4 text-[11px] font-bold text-gray-700 min-w-[120px] text-center border-x py-1 bg-white rounded">Página {pagination.currentPage} de {totalPages}</div>
            <Button variant="outline" size="icon" onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))} disabled={pagination.currentPage === totalPages} className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => setPagination(prev => ({ ...prev, currentPage: totalPages }))} disabled={pagination.currentPage === totalPages} className="h-8 w-8"><ChevronsRight className="h-4 w-4" /></Button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading} className="h-8 px-4 bg-white"><RefreshCw className={cn("h-3 w-3 mr-2", isLoading && "animate-spin")} /> Actualizar</Button>
        </div>
      </div>
    </div>
  );
};
