'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Database, Loader2, Search, PlayCircle, StopCircle, UserCheck } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MaterialBrutoItem {
  [key: string]: any;
}

const ROWS_PER_PAGE_OPTIONS = [20, 50, 100, 200];
const BLOCK_SIZE = 5000; 

// Listado maestro de códigos FERT para Muebles/Camas
const MUEBLES_FERT_LIST = [
  "20000397", "20000182", "20000181", "20000216", "20000215", "20000171", "20000170", "20000140", "20000141", "20000454", 
  "20000455", "20000143", "20000142", "20000234", "20000233", "20000236", "20000235", "20000232", "20000237", "20000238", 
  "20000239", "20000240", "20000241", "20000242", "20000346", "20000347", "20000348", "20000349", "20000185", "20000186", 
  "20000187", "20000199", "20000217", "20000218", "20000219", "20000223", "20000212", "20000213", "20000214", "20000231", 
  "20000331", "20000332", "20000333", "20000334", "20000335", "20000220", "20000011", "20000012", "20000013", "20000147", 
  "20000160", "20000184", "20000200", "20000201", "20000202", "20000203", "20000204", "20000145", "20000221", "20000222", 
  "20000345", "20000243", "20000124", "20000230", "20000350", "20000351", "20000352", "20000353", "20000354", "20000355", 
  "20000356", "20000357", "20000358", "20000359", "20000360", "20000364"
];

const RESPONSABLES_MUEBLES = ["019", "006", "19", "6"];

const cleanCode = (code: any): string => {
  if (!code) return '';
  const str = String(code).trim();
  return str.startsWith('00000000') ? str.substring(8) : str;
};

export const MaterialesBrutosTab: React.FC = () => {
    const { addNotification } = useAppContext();
    const [allData, setAllData] = useState<MaterialBrutoItem[]>([]); 
    const [isLoading, setIsLoading] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[1]); 
    const [totalRecords, setTotalRecords] = useState(0);
    const [loadedBlocks, setLoadedBlocks] = useState<Set<number>>(new Set());
    const [filterMuebles, setFilterMuebles] = useState(false);

    // Refs para scrollbar doble
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    // Filtrado dinámico
    const filteredData = useMemo(() => {
        let data = allData;

        if (filterMuebles) {
          data = data.filter(row => {
            const fert = cleanCode(row.FERT_PRINCIPAL || row.MATERIAL_PADRE);
            const resp = String(row.RESP_CTRL_PROD || row.RESPONSABLE || row.RespControlProd || '').trim();
            const sector = String(row.SECTOR || '').trim();
            
            const isMuebleCode = MUEBLES_FERT_LIST.includes(fert);
            const isMuebleResp = RESPONSABLES_MUEBLES.includes(resp) || sector === '03';
            
            return isMuebleCode || isMuebleResp;
          });
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            data = data.filter(row => {
                return Object.values(row).some(val => String(val).toLowerCase().includes(term));
            });
        }

        return data;
    }, [allData, searchTerm, filterMuebles]);

    const loadBlock = async (blockPage: number) => {
        if (loadedBlocks.has(blockPage)) return null;

        setIsLoading(true);
        try {
            const response = await serviciosService.getMaterialesBrutosPorMaterialMateriaPrima(blockPage, BLOCK_SIZE);
            if (response && response.data) {
                const dataArray = Array.isArray(response.data) ? response.data : [response.data];
                
                if (blockPage === 1) {
                    setTotalRecords(response.totalRegistros || response.totalRecords || 0);
                    if (dataArray.length > 0) {
                        setColumns(Object.keys(dataArray[0]));
                    }
                }

                setAllData(prev => [...prev, ...dataArray]);
                setLoadedBlocks(prev => {
                  const next = new Set(prev);
                  next.add(blockPage);
                  return next;
                });
                return dataArray;
            }
        } catch (error) {
            console.error('Error al cargar bloque:', error);
            addNotification('error', 'Error al cargar datos de materiales brutos');
        } finally {
            setIsLoading(false);
        }
        return null;
    };

    // Función de escaneo automático
    const scanForMuebles = async () => {
      setIsScanning(true);
      addNotification('info', 'Iniciando escaneo profundo para localizar datos de Muebles...');
      
      let currentBlock = Math.ceil(allData.length / BLOCK_SIZE) + 1;
      let foundSomething = false;
      const MAX_BLOCKS = 20; // Escanear hasta 100,000 registros

      for (let i = 0; i < MAX_BLOCKS; i++) {
        if (!isScanning && i > 0) break; // Permitir detener el escaneo

        const newData = await loadBlock(currentBlock);
        if (!newData) break;

        // Verificar si este bloque tiene info de muebles
        const hasMuebles = newData.some((row: any) => {
          const fert = cleanCode(row.FERT_PRINCIPAL || row.MATERIAL_PADRE);
          const resp = String(row.RESP_CTRL_PROD || row.RESPONSABLE || row.RespControlProd || '').trim();
          return MUEBLES_FERT_LIST.includes(fert) || RESPONSABLES_MUEBLES.includes(resp);
        });

        if (hasMuebles) {
          foundSomething = true;
          addNotification('success', '¡Se han localizado datos de Muebles en la base de datos!');
          setFilterMuebles(true);
          break;
        }

        currentBlock++;
        // Pequeña pausa para no saturar
        await new Promise(r => setTimeout(r, 100));
      }

      if (!foundSomething) {
        addNotification('warning', 'Se han revisado los primeros registros y no se localizaron datos de Muebles. Intente cargar más bloques manualmente.');
      }
      setIsScanning(false);
    };

    // Carga inicial
    useEffect(() => {
        loadBlock(1);
    }, []);

    const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));

    const displayedData = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredData.slice(start, start + rowsPerPage);
    }, [filteredData, currentPage, rowsPerPage]);

    const handlePageChange = (page: number) => {
        const newPage = Math.max(1, Math.min(page, totalPages));
        setCurrentPage(newPage);

        const threshold = (newPage * rowsPerPage) + rowsPerPage;
        if (allData.length < threshold && allData.length < totalRecords) {
            const nextBlock = Math.ceil(allData.length / BLOCK_SIZE) + 1;
            loadBlock(nextBlock);
        }
    };

    // Sincronización de scrollbars
    useEffect(() => {
        const calculateWidth = () => {
            if (tableRef.current) setTableWidth(tableRef.current.offsetWidth);
        };
        calculateWidth();
        window.addEventListener('resize', calculateWidth);
        const resizeObserver = new ResizeObserver(calculateWidth);
        if (tableRef.current) resizeObserver.observe(tableRef.current);
        return () => {
            window.removeEventListener('resize', calculateWidth);
            if (tableRef.current) resizeObserver.unobserve(tableRef.current);
        };
    }, [displayedData]);

    const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (lastScrolledRef.current === 'table') { lastScrolledRef.current = null; return; }
        if (tableScrollRef.current) {
            lastScrolledRef.current = 'top';
            tableScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (lastScrolledRef.current === 'top') { lastScrolledRef.current = null; return; }
        if (topScrollRef.current) {
            lastScrolledRef.current = 'table';
            topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center gap-4 flex-1">
                  <div className="relative w-full md:w-80">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input 
                          placeholder="Buscar en la tabla..." 
                          className="pl-10 h-9"
                          value={searchTerm}
                          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                      />
                  </div>
                  <Button 
                    variant={filterMuebles ? "default" : "outline"}
                    size="sm"
                    className={cn("gap-2", filterMuebles && "bg-indigo-600 hover:bg-indigo-700")}
                    onClick={() => setFilterMuebles(!filterMuebles)}
                  >
                    <UserCheck className="h-4 w-4" />
                    Filtro Muebles (019/006)
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={scanForMuebles}
                    disabled={isScanning || isLoading}
                    className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  >
                    {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Escaneo Profundo de Muebles
                  </Button>
                  {isLoading && !isScanning && (
                      <div className="flex items-center gap-2 text-xs text-blue-600 animate-pulse">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Cargando...
                      </div>
                  )}
                </div>
            </div>

            {isScanning && (
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-md flex items-center justify-between animate-pulse">
                <p className="text-xs text-indigo-800 font-medium">
                  Escaneando base de datos para localizar componentes de Muebles... Procesados: {allData.length.toLocaleString()} registros.
                </p>
                <Button variant="ghost" size="sm" onClick={() => setIsScanning(false)} className="h-6 text-indigo-700">
                  <StopCircle className="h-4 w-4 mr-1" /> Detener
                </Button>
              </div>
            )}

            {displayedData.length > 0 ? (
                <>
                    <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden h-[18px]">
                        <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
                    </div>

                    <div ref={tableScrollRef} onScroll={handleTableScroll} className="border rounded-lg overflow-auto max-h-[60vh]">
                        <table ref={tableRef} className="min-w-full text-[11px] border-collapse">
                            <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                                <tr className="border-b-2 border-gray-300">
                                    {columns.map(col => (
                                        <TableHead key={col} className="text-center font-bold text-gray-700 uppercase tracking-wider px-4 py-2 border-r border-dashed border-gray-300 last:border-r-0 whitespace-nowrap">
                                            {col}
                                        </TableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {displayedData.map((row, idx) => {
                                  const isMuebleRow = RESPONSABLES_MUEBLES.includes(String(row.RESP_CTRL_PROD || row.RESPONSABLE || '').trim());
                                  return (
                                    <tr key={idx} className={cn("hover:bg-gray-50 transition-colors", isMuebleRow && "bg-indigo-50/20")}>
                                        {columns.map((col, cIdx) => {
                                            let val = row[col];
                                            if (['FERT_PRINCIPAL', 'MATERIAL_PADRE', 'COMPONENTE', 'CodMaterial'].includes(col)) {
                                              val = cleanCode(val);
                                            }
                                            return (
                                              <TableCell key={`${idx}-${cIdx}`} className="px-4 py-2 text-center border-r border-dashed border-gray-200 last:border-r-0 whitespace-nowrap">
                                                  {String(val ?? '-')}
                                              </TableCell>
                                            );
                                        })}
                                    </tr>
                                  );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-600">Filas por página:</span>
                            <select
                                value={rowsPerPage}
                                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                className="px-3 py-1.5 border rounded-md text-xs bg-white"
                            >
                                {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-600 font-medium">
                                Página {currentPage} de {totalPages} ({filteredData.length.toLocaleString()} de {totalRecords.toLocaleString()} registros)
                            </span>
                            <div className="flex gap-1 ml-4">
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(1)} disabled={currentPage === 1}>Primera</Button>
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>Anterior</Button>
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages}>Siguiente</Button>
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(totalPages)} disabled={currentPage >= totalPages}>Última</Button>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-gray-50 border-2 border-dashed rounded-xl">
                    {isLoading ? (
                        <>
                            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                            <p className="text-blue-800 font-semibold text-sm">Escaneando base de datos...</p>
                            <p className="text-gray-500 text-xs mt-1">Bloques cargados: {loadedBlocks.size}</p>
                        </>
                    ) : (
                        <>
                            <Database className="w-12 h-12 text-gray-300 mb-4" />
                            <p className="text-gray-500 text-sm">No se han encontrado registros de Muebles o Responsables 019/006 en los bloques cargados.</p>
                            <p className="text-gray-400 text-xs mt-2">Use el botón "Escaneo Profundo de Muebles" para buscar en toda la base de datos.</p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};