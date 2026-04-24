'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Package, Loader2 } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

interface CuboInventariosItem {
  [key: string]: any;
}

const ROWS_PER_PAGE_OPTIONS = [20, 50, 100, 200];

export const CuboInventariosTab: React.FC = () => {
    const { addNotification } = useAppContext();
    const [data, setData] = useState<CuboInventariosItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[0]);

    const fetchInventario = useCallback(async (page: number, limit: number) => {
        setIsLoading(true);
        try {
            const response = await serviciosService.getCuboInventarios(page, limit);
            
            if (response && response.data) {
                const dataArray = Array.isArray(response.data) ? response.data : [response.data];
                setData(dataArray);

                if (response.totalRegistros && totalRecords === 0) {
                    setTotalRecords(response.totalRegistros);
                }

                if (dataArray.length > 0 && columns.length === 0) {
                    setColumns(Object.keys(dataArray[0]));
                }

                if (dataArray.length === 0 && page === 1) {
                    addNotification('info', 'No se encontraron datos en Cubo de Inventarios.');
                }
            } else {
                setData([]);
                addNotification('warning', 'No se recibieron datos del Cubo de Inventarios.');
            }
        } catch (error) {
            addNotification('error', `Error al cargar datos de inventario: ${(error as Error).message}`);
            setData([]);
        } finally {
            setIsLoading(false);
        }
    }, [addNotification, columns.length, totalRecords]);

    useEffect(() => {
        fetchInventario(currentPage, rowsPerPage);
    }, [currentPage, rowsPerPage, fetchInventario]);

    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / rowsPerPage) : 1;

    const goToPage = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };

    const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setRowsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    if (isLoading && data.length === 0) {
        return (
            <div className="flex justify-center items-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span className="ml-3 text-gray-600">Cargando Inventario...</span>
            </div>
        );
    }

    if (!isLoading && data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Package className="w-12 h-12 mb-4 text-gray-300" />
              <p>No hay datos de inventario para mostrar.</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
             <div className="flex items-center justify-between">
                 <div className="flex items-center space-x-2">
                     <span className="text-sm text-gray-600">Filas por página:</span>
                     <select
                         value={rowsPerPage}
                         onChange={handleRowsPerPageChange}
                         className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                     >
                         {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
                     </select>
                 </div>
                 <div className="flex items-center space-x-2">
                     <span className="text-sm text-gray-600">Página {currentPage} de {totalPages}</span>
                     <Button variant="outline" size="sm" onClick={() => goToPage(1)} disabled={currentPage === 1}>Primera</Button>
                     <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>Anterior</Button>
                     <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>Siguiente</Button>
                     <Button variant="outline" size="sm" onClick={() => goToPage(totalPages)} disabled={currentPage >= totalPages}>Última</Button>
                 </div>
            </div>
             <div className="border rounded-lg overflow-auto max-h-[60vh]">
                 <Table>
                     <TableHeader className="bg-gray-100 sticky top-0">
                         <TableRow>
                             {columns.map(col => <TableHead key={col}>{col}</TableHead>)}
                         </TableRow>
                     </TableHeader>
                     <TableBody>
                        {data.map((row, idx) => (
                           <TableRow key={idx}>
                                {columns.map(col => (
                                   <TableCell key={`${idx}-${col}`}>{String(row[col] ?? '-')}</TableCell>
                               ))}
                           </TableRow>
                        ))}
                     </TableBody>
                 </Table>
            </div>
        </div>
    );
};
