
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { Clock, Loader2, Search, Home, AlertCircle, UserCircle, Check, ChevronsUpDown, X, LayoutGrid, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { cn } from '@/lib/utils';

interface TiempoEnsamblado {
  CodMaterial: string;
  Centro: string;
  PuestoTrabajoLinea: string;
  Linea: string;
  PuestoTrabajo: string;
  Tiempo_Min: number;
  StockActual: number;
  StockSeguridad: number;
  StockMaximo: number;
  GrupoCompras: string;
  ClaseAprovisionam: string;
  TamLoteMin: number;
  TamLoteMax: number;
  RespCtrlProd: string;
  NombRespControlProd: string;
}

interface TiemposEnsambladoTabSectionProps {
  readonly allowedLines?: string[];
  readonly allowedWorkstations?: string[];
  readonly isCompact?: boolean;
}

/**
 * Normaliza una cadena de fecha a formato YYYY-MM-DD
 * Soporta DD/MM/YYYY y YYYY-MM-DD
 */
const normalizeDateISO = (dateStr: any): string | null => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  
  // Caso: DD/MM/YYYY
  let match = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  
  // Caso: YYYY-MM-DD
  match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  
  return null;
};

export const TiemposEnsambladoTabSection: React.FC<TiemposEnsambladoTabSectionProps> = ({ 
  allowedLines, 
  allowedWorkstations,
  isCompact = false 
}) => {
  const inspector = useRuntimeInspector('TiemposEnsambladoTab');
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  const [allData, setAllData] = useState<TiempoEnsamblado[]>([]);
  const [fertOrders, setFertOrders] = useState<any[]>([]);
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedResponsables, setSelectedResponsables] = useState<string[]>([]);
  const [selectedLineas, setSelectedLineas] = useState<string[]>([]);
  const [programmingDate, setProgrammingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [provisionalDate, setProvisionalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const [isRespFilterOpen, setIsRespFilterOpen] = useState(false);
  const [isLineaFilterOpen, setIsLineFilterOpen] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const normalizeMaterialCode = (code: string | number): string => {
    return String(code || '').trim().slice(-8);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const centersFromGroups = [...new Set((groupsRes?.data || []).map((g: any) => String(g.centro).trim()))].sort();
      setAvailableCenters(centersFromGroups);
      if (centersFromGroups.length > 0 && !selectedCenter) setSelectedCenter(centersFromGroups[0]);

      // Cargar datos de Tiempos si no hay nada en el estado
      if (allData.length === 0) {
        let allTiempos: TiempoEnsamblado[] = [];
        let page = 1;
        let hasMore = true;
        const pageSize = 10000;

        while (hasMore) {
          const response = await serviciosService.getTiemposEnsamblado(page, pageSize);
          const rawData = Array.isArray(response?.data) ? response.data : [];
          allTiempos = [...allTiempos, ...rawData];
          
          const total = response.totalRegistros || response.totalRecords || 0;
          if (allTiempos.length >= total || rawData.length < pageSize || total === 0) {
            hasMore = false;
          } else {
            page++;
          }
          if (page > 50) break; 
        }
        setAllData(allTiempos);
        inspector.captureVariable('tiempos_raw_count', allTiempos.length);
      }

      // Cargar datos FERT siempre en modo compacto
      if (isCompact) {
        const fertResponse = await serviciosService.getOrdenesFert(1, 10000);
        const rawFert = Array.isArray(fertResponse?.data) ? fertResponse.data : [];
        
        const mappedFert = rawFert.map((o: any) => {
          const cat = String(o.CATEGORIA || '').toUpperCase();
          let calculatedLinea = '';
          if (cat.includes('L1')) calculatedLinea = 'LINEA 1';
          else if (cat.includes('L2')) calculatedLinea = 'LINEA 2';
          else if (cat.includes('L3')) calculatedLinea = 'LINEA 3';
          else if (cat.includes('L5')) calculatedLinea = 'LINEA 5';
          else if (cat.includes('B-B')) calculatedLinea = 'LINEA 5';
          else calculatedLinea = String(o.LINEA || '').trim().toUpperCase();

          return { ...o, LINEA_MAPPED: calculatedLinea };
        });
        setFertOrders(mappedFert);
        inspector.captureVariable('fert_raw_count', mappedFert.length);
      }
      
    } catch (err) {
      addNotification('error', `Error al cargar datos técnicos: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector, selectedCenter, isCompact, allData.length]);

  useEffect(() => {
    if (!hasStarted.current || isCompact) {
      hasStarted.current = true;
      loadData();
    }
  }, [loadData, isCompact]);

  const baseData = useMemo(() => {
    let base = allData.filter(row => String(row.Centro || '').trim() === selectedCenter);
    
    if (allowedLines && allowedLines.length > 0) {
      const allowedUpper = allowedLines.map(l => l.toUpperCase());
      base = base.filter(row => {
        const rowLinea = String(row.Linea || '').trim().toUpperCase();
        return allowedUpper.some(allowed => rowLinea === allowed || rowLinea.includes(allowed) || allowed.includes(rowLinea));
      });
    }

    if (allowedWorkstations && allowedWorkstations.length > 0) {
      const allowedNormalized = allowedWorkstations.map(w => String(w).toUpperCase().replace(/\s+/g, ''));
      base = base.filter(row => {
        const rowPuesto = String(row.PuestoTrabajo || '').toUpperCase().replace(/\s+/g, '');
        return allowedNormalized.includes(rowPuesto);
      });
    }
    
    return base;
  }, [allData, selectedCenter, allowedLines, allowedWorkstations]);

  // Mapa de suma de Cant Pendiente por (Fecha, Línea, Material) para FERT
  const fertSumMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!isCompact || !fertOrders.length || !programmingDate) return map;

    const targetDateISO = normalizeDateISO(programmingDate);
    if (!targetDateISO) return map;

    fertOrders.forEach(o => {
      const fertDateISO = normalizeDateISO(o.FECHA || o.fecha);
      
      if (fertDateISO === targetDateISO) {
        const linea = String(o.LINEA_MAPPED || '').trim().toUpperCase();
        const material = normalizeMaterialCode(o.MATERIAL || o.Material || o.CodMaterial);
        const key = `${linea}|${material}`;
        
        const pend = Number(o.CANTPENDIENTE || o.CantPendiente || 0) || 0;
        map.set(key, (map.get(key) || 0) + pend);
      }
    });

    return map;
  }, [isCompact, fertOrders, programmingDate]);

  const responsablesDisponibles = useMemo(() => {
    return [...new Set(baseData.map(row => String(row.NombRespControlProd || '').trim()))].filter(Boolean).sort();
  }, [baseData]);

  const lineasDisponibles = useMemo(() => {
    return [...new Set(baseData.map(row => String(row.Linea || '').trim()))].filter(Boolean).sort();
  }, [baseData]);

  const currentViewData = useMemo(() => {
    let result = baseData;
    if (selectedResponsables.length > 0) {
      result = result.filter(row => selectedResponsables.includes(String(row.NombRespControlProd || '').trim()));
    }
    if (selectedLineas.length > 0) {
      result = result.filter(row => selectedLineas.includes(String(row.Linea || '').trim()));
    }
    const term = searchTerm.toLowerCase().trim();
    if (!term) return result;
    return result.filter(row => 
      String(row.CodMaterial || '').toLowerCase().includes(term) ||
      String(row.Linea || '').toLowerCase().includes(term) ||
      String(row.PuestoTrabajo || '').toLowerCase().includes(term) ||
      String(row.NombRespControlProd || '').toLowerCase().includes(term)
    );
  }, [baseData, selectedResponsables, selectedLineas, searchTerm]);

  const totalPagesLocal = Math.max(1, Math.ceil(currentViewData.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedData = currentViewData.slice(startIndex, endIndex);

  const formatMaterial = (mat: string) => String(mat || '').replace(/^0+/, '');

  const toggleResponsable = (resp: string) => {
    setSelectedResponsables(prev => prev.includes(resp) ? prev.filter(r => r !== resp) : [...prev, resp]);
    setCurrentPage(1);
  };

  const toggleLinea = (linea: string) => {
    setSelectedLineas(prev => prev.includes(linea) ? prev.filter(l => l !== linea) : [...prev, linea]);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSelectedResponsables([]);
    setSelectedLineas([]);
    setSearchTerm('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Clock className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Tiempos de Ensamblado / Muebles</h3>
            <p className="text-xs text-gray-500 mt-1">Matriz técnica de tiempos unitarios y parámetros de lote</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {isCompact && (
            <>
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-md px-3 py-1.5 h-9">
                <label htmlFor="prog-date" className="text-[10px] font-bold text-gray-400 uppercase whitespace-nowrap">Día programación:</label>
                <input
                  id="prog-date"
                  type="date"
                  value={programmingDate}
                  onChange={(e) => {
                      setProgrammingDate(e.target.value);
                      setCurrentPage(1);
                  }}
                  className="text-xs border-none bg-transparent focus:ring-0 font-medium text-indigo-700 outline-none"
                />
                <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
              </div>

              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-md px-3 py-1.5 h-9">
                <label htmlFor="prev-date" className="text-[10px] font-bold text-gray-400 uppercase whitespace-nowrap">Fecha previsionales:</label>
                <input
                  id="prev-date"
                  type="date"
                  value={provisionalDate}
                  onChange={(e) => {
                      setProvisionalDate(e.target.value);
                      setCurrentPage(1);
                  }}
                  className="text-xs border-none bg-transparent focus:ring-0 font-medium text-indigo-700 outline-none"
                />
                <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
              </div>
            </>
          )}

          {!isCompact && (
            <Popover open={isRespFilterOpen} onOpenChange={setIsRespFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-56 justify-between bg-white font-normal text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <UserCircle className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">
                      {selectedResponsables.length === 0 ? "Responsables" : `${selectedResponsables.length} responsables`}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end">
                <Command>
                  <CommandInput placeholder="Buscar responsable..." className="h-8 text-xs" />
                  <CommandEmpty>No encontrado.</CommandEmpty>
                  <CommandGroup className="max-h-64 overflow-y-auto">
                    {responsablesDisponibles.map((resp) => (
                      <CommandItem key={resp} value={resp} onSelect={() => toggleResponsable(resp)} className="text-xs">
                        <Check className={cn("mr-2 h-3.5 w-3.5", selectedResponsables.includes(resp) ? "opacity-100" : "opacity-0")} />
                        {resp}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          )}

          <Popover open={isLineaFilterOpen} onOpenChange={setIsLineFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-48 justify-between bg-white font-normal text-xs">
                <div className="flex items-center gap-2 truncate">
                  <LayoutGrid className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">
                    {selectedLineas.length === 0 ? "Líneas" : `${selectedLineas.length} líneas`}
                  </span>
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="end">
              <Command>
                <CommandInput placeholder="Buscar línea..." className="h-8 text-xs" />
                <CommandEmpty>No encontrada.</CommandEmpty>
                <CommandGroup className="max-h-64 overflow-y-auto">
                  {lineasDisponibles.map((linea) => (
                    <CommandItem key={linea} value={linea} onSelect={() => toggleLinea(linea)} className="text-xs">
                      <Check className={cn("mr-2 h-3.5 w-3.5", selectedLineas.includes(linea) ? "opacity-100" : "opacity-0")} />
                      {linea}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Material, puesto..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => { hasStarted.current = false; setFertOrders([]); setAllData([]); loadData(); }}>
            Actualizar
          </Button>
        </div>
      </div>

      {(selectedResponsables.length > 0 || selectedLineas.length > 0 || searchTerm) && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase mr-2">Filtros:</span>
          {selectedResponsables.map(resp => (
            <Badge key={`chip-resp-${resp}`} variant="secondary" className="bg-indigo-50 text-indigo-700 text-[10px] py-0 px-2 flex items-center gap-1">
              Resp: {resp}
              <X className="w-3 h-3 cursor-pointer" onClick={() => toggleResponsable(resp)} />
            </Badge>
          ))}
          {selectedLineas.map(linea => (
            <Badge key={`chip-linea-${linea}`} variant="secondary" className="bg-emerald-50 text-emerald-700 text-[10px] py-0 px-2 flex items-center gap-1">
              Línea: {linea}
              <X className="w-3 h-3 cursor-pointer" onClick={() => toggleLinea(linea)} />
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-gray-500 underline" onClick={clearFilters}>
            Limpiar todo
          </Button>
        </div>
      )}

      <Tabs value={selectedCenter} onValueChange={(val) => { setSelectedCenter(val); setCurrentPage(1); setSelectedResponsables([]); setSelectedLineas([]); }} className="w-full">
        <TabsList className="flex h-auto bg-gray-100/50 p-1 mb-4">
          {availableCenters.map(center => (
            <TabsTrigger 
              key={center} 
              value={center}
              className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-6 py-2 text-xs font-bold uppercase tracking-wider"
            >
              <Home className="w-3 h-3 mr-2" />
              Centro {center} ({allData.filter(d => String(d.Centro || '').trim() === center).length})
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Material</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Línea</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Puesto Trabajo</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/30">Tiempo (min)</th>
                  {isCompact && (
                    <>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50/30">Cant ordFab</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-amber-700 uppercase tracking-wider bg-amber-50/30">Cant ordPrev</th>
                    </>
                  )}
                  {!isCompact && (
                    <>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stock Act.</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stock Seg.</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Aprov.</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lote Mín.</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lote Máx.</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Responsable</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedData.length > 0 ? displayedData.map((row, idx) => {
                  const line = String(row.Linea || '').trim().toUpperCase();
                  const material = normalizeMaterialCode(row.CodMaterial);
                  const key = `${line}|${material}`;
                  const cantOrdFab = fertSumMap.get(key) || 0;

                  return (
                    <tr key={`${row.CodMaterial}-${idx}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-mono font-bold text-gray-900">{formatMaterial(row.CodMaterial)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">{row.Linea}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[10px] text-gray-500 font-medium">{row.PuestoTrabajo}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-right text-indigo-600 bg-indigo-50/10">
                        {Number(row.Tiempo_Min || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                      </td>
                      {isCompact && (
                        <>
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-right text-emerald-700 bg-emerald-50/5">
                            {cantOrdFab > 0 ? cantOrdFab.toLocaleString() : '0'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-right text-amber-700 bg-amber-50/5">0</td>
                        </>
                      )}
                      {!isCompact && (
                        <>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-right text-gray-500">{row.StockActual}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-right text-gray-700 font-semibold">{row.StockSeguridad}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <Badge variant="outline" className="text-[10px] font-bold bg-blue-50 text-blue-700">{row.ClaseAprovisionam}</Badge>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[10px] text-right text-gray-500">{row.TamLoteMin}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-[10px] text-right text-gray-500">{row.TamLoteMax || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-[10px] text-gray-600 truncate max-w-[150px]" title={row.NombRespControlProd}>
                            {row.NombRespControlProd}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={isCompact ? 6 : 10} className="px-6 py-12 text-center text-gray-400 italic">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="w-8 h-8 text-gray-300" />
                        <span>No se encontraron registros técnicos para el centro seleccionado.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-50 px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs">
              <span className="font-medium text-gray-500 uppercase">Ver:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="border rounded p-1 bg-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-gray-400">
                {startIndex + 1} - {Math.min(startIndex + rowsPerPage, currentViewData.length)} de {currentViewData.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Anterior</Button>
              <div className="px-4 py-1 bg-white border rounded text-sm font-bold text-indigo-600 min-w-[80px] text-center">{currentPage} / {totalPagesLocal}</div>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPagesLocal, p + 1))} disabled={currentPage === totalPagesLocal}>Siguiente</Button>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
};
