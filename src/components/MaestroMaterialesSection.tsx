'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MaestroMaterialCentro } from '@/types/types';
import { estacionService } from '@/services/MaestroMaterialCentro.service';
import { Loader2, ClipboardList } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

export const MaestroMaterialesSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [materiales, setMateriales] = useState<MaestroMaterialCentro[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [totalRecords, setTotalRecords] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(20);
    const [filters, setFilters] = useState({ centro: '', material: '' });

    const fetchData = useCallback(async (page: number, limit: number, currentFilters: {centro: string, material: string}) => {
        setIsLoading(true);
        try {
            let response;
            if (currentFilters.centro || currentFilters.material) {
                response = await estacionService.getMaterialPorCentroYMaterial(currentFilters.centro, currentFilters.material, page, limit);
                if (response && response.length) {
                    setTotalRecords(response.length);
                } else {
                    setTotalRecords(0);
                }
            } else {
                // Fetch total only if not filtering
                const totalResponse = await estacionService.getTotalMateriales();
                if (totalResponse && totalResponse.data && totalResponse.data.length > 0) {
                    setTotalRecords(totalResponse.data[0]);
                }
                response = await estacionService.getMaterialesPaginados(page, limit);
            }

            if (response && response.data) {
                setMateriales(response.data);
            } else {
                setMateriales([]);
            }
        } catch (error) {
            addNotification('error', `Error al cargar los materiales: ${(error as Error).message}`);
            setMateriales([]);
        } finally {
            setIsLoading(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchData(currentPage, rowsPerPage, filters);
    }, [currentPage, rowsPerPage, filters, fetchData]);
    
    const handleFilterSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setCurrentPage(1);
        // The useEffect will trigger the fetch
    };
    
    const handleClearFilters = () => {
        setFilters({ centro: '', material: '' });
        setCurrentPage(1);
        // The useEffect will trigger the fetch
    };
    
    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / rowsPerPage) : 1;

    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center space-x-3">
                <ClipboardList />
                <h2 className="text-2xl font-semibold text-gray-700">Maestro de Materiales</h2>
            </div>
            
            <p className="text-gray-600 text-sm">
                Consulta y explora el maestro de materiales completo disponible en el sistema. Utiliza los filtros para buscar registros específicos.
            </p>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <form onSubmit={handleFilterSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-4 p-4 border rounded-lg bg-gray-50">
                    <div>
                        <label htmlFor="centro-filter" className="block text-sm font-medium text-gray-700">Centro</label>
                        <input type="text" id="centro-filter" name="centro" value={filters.centro} onChange={handleFilterChange} className="mt-1 w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm" />
                    </div>
                    <div>
                        <label htmlFor="material-filter" className="block text-sm font-medium text-gray-700">Material (Código)</label>
                        <input type="text" id="material-filter" name="material" value={filters.material} onChange={handleFilterChange} className="mt-1 w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm" />
                    </div>
                    <div className="flex space-x-2">
                         <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">Filtrar</button>
                         <button type="button" onClick={handleClearFilters} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 text-sm">Limpiar</button>
                    </div>
                </form>

                <div className="border rounded-lg overflow-auto max-h-[60vh]">
                    <table className="min-w-full text-xs divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro</th>
                                <th className="px-2 py-2 text-left font-semibold text-gray-600">Material</th>
                                <th className="px-2 py-2 text-left font-semibold text-gray-600">Descripción</th>
                                <th className="px-2 py-2 text-left font-semibold text-gray-600">Tipo</th>
                                <th className="px-2 py-2 text-left font-semibold text-gray-600">Marca</th>
                                <th className="px-2 py-2 text-left font-semibold text-gray-600">Familia</th>
                                <th className="px-2 py-2 text-left font-semibold text-gray-600">Sector</th>
                                <th className="px-2 py-2 text-left font-semibold text-gray-600">Resp. Control Prod.</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200">
                            {isLoading ? (
                                <tr><td colSpan={8} className="text-center p-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
                            ) : materiales.length > 0 ? (
                                materiales.map((mat, index) => (
                                    <tr key={`${mat.MATERIAL}-${mat.CENTRO}-${index}`}>
                                        <td className="px-2 py-2">{mat.CENTRO}</td>
                                        <td className="px-2 py-2 font-mono">{mat.MATERIAL}</td>
                                        <td className="px-2 py-2">{mat.DESCRIPCION}</td>
                                        <td className="px-2 py-2">{mat.TIPO_MATERIAL}</td>
                                        <td className="px-2 py-2">{mat.MARCA}</td>
                                        <td className="px-2 py-2">{mat.FAMILIA || 'N/A'}</td>
                                        <td className="px-2 py-2">{mat.SECTOR}</td>
                                        <td className="px-2 py-2">{mat.NombRespControlProd || mat.RespControlProd || 'N/A'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={8} className="text-center p-8">No se encontraron materiales.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                 <div className="flex justify-between items-center mt-4 text-sm">
                    <div>
                        <span>Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong></span>
                        <span className="ml-4">({totalRecords} registros)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="px-3 py-1 border rounded disabled:opacity-50">Anterior</button>
                        <span>{currentPage}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-3 py-1 border rounded disabled:opacity-50">Siguiente</button>
                         <select value={rowsPerPage} onChange={e => {setRowsPerPage(Number(e.target.value)); setCurrentPage(1);}} className="border rounded py-1">
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};
