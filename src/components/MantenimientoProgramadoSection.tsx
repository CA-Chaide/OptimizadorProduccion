'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';
import type { Restriccion } from '@/types/interfaces';

interface MantenimientoProgramado {
  [key: string]: any;
}

interface MantenimientoProgramadoSectionProps {
  restricciones?: Restriccion[];
}

const ROWS_PER_PAGE = 20;

export const MantenimientoProgramadoSection: React.FC<MantenimientoProgramadoSectionProps> = ({ restricciones = [] }) => {
  const { addNotification } = useAppContext();
  const [mantenimientosRaw, setMantenimientosRaw] = useState<MantenimientoProgramado[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [columns, setColumns] = useState<string[]>([]);

  // Responsables de Control de Producción habilitados para Muebles (restricción "RespCtrlProd")
  const validRespCodes = useMemo(() => {
    const respRestriccion = restricciones.find(r => r.nombre_restriccion === 'RespCtrlProd');
    if (!respRestriccion || !respRestriccion.valor_restriccion) return [];

    return respRestriccion.valor_restriccion
      .split(/[&,]/)
      .map(code => String(code).trim())
      .filter(Boolean);
  }, [restricciones]);

  // Máquinas excluidas por responsable (restricción "HRNP")
  const forbiddenMachinesMap = useMemo(() => {
    const hrnpRestriccion = restricciones.find(r => r.nombre_restriccion === 'HRNP');
    if (!hrnpRestriccion || !hrnpRestriccion.valor_restriccion) return new Map<string, string[]>();

    const map = new Map<string, string[]>();
    const regex = /\[([^:]+):\{([^}]+)\}\]/g;
    let match;

    const rawValue = hrnpRestriccion.valor_restriccion;
    while ((match = regex.exec(rawValue)) !== null) {
      const respCode = match[1].trim();
      const machines = match[2].split(',').map(m => m.trim()).filter(Boolean);
      map.set(respCode, machines);
    }
    return map;
  }, [restricciones]);

  const mantenimientos = useMemo(() => {
    return mantenimientosRaw.filter(row => {
      const rowResp = String(row.RespCtrlProd || '').trim();

      if (validRespCodes.length > 0 && !validRespCodes.includes(rowResp)) {
        return false;
      }

      if (forbiddenMachinesMap.has(rowResp)) {
        const rowMachine = String(row.MaquinaSismac || row.MAQUINA || '').trim();
        const forbiddenOnes = forbiddenMachinesMap.get(rowResp);
        if (forbiddenOnes?.includes(rowMachine)) {
          return false;
        }
      }

      return true;
    });
  }, [mantenimientosRaw, validRespCodes, forbiddenMachinesMap]);

  // Si el filtrado reduce la cantidad de páginas, evita quedar atrapado en una página vacía
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(mantenimientos.length / ROWS_PER_PAGE));
    setCurrentPage(prev => Math.min(prev, maxPage));
  }, [mantenimientos.length]);

  useEffect(() => {
    fetchMantenimientos();
  }, []);

  const fetchMantenimientos = async () => {
    setIsLoading(true);
    try {
      const response = await serviciosService.ListarMantenimientoPreventivosProgramados();
      if (response && response.data) {
        const dataArray = Array.isArray(response.data) ? response.data : [response.data];
        setMantenimientosRaw(dataArray);

        // Extraer columnas del primer registro
        if (dataArray.length > 0) {
          setColumns(Object.keys(dataArray[0]));
        }
      } else {
        setMantenimientosRaw([]);
        addNotification('warning', 'No se encontraron mantenimientos programados');
      }
    } catch (error) {
      addNotification('error', `Error al cargar mantenimientos: ${(error as Error).message}`);
      setMantenimientosRaw([]);
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(mantenimientos.length / ROWS_PER_PAGE);
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const endIndex = startIndex + ROWS_PER_PAGE;
  const currentData = mantenimientos.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Mantenimientos Preventivos Programados</h2>
        <button
          onClick={fetchMantenimientos}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          disabled={isLoading}
        >
          Actualizar
        </button>
      </div>

      {mantenimientos.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No hay mantenimientos programados
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-sm font-semibold text-gray-700 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentData.map((row, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50 transition-colors">
                    {columns.map((col) => (
                      <td
                        key={`${idx}-${col}`}
                        className="px-4 py-3 text-sm text-gray-700"
                      >
                        {typeof row[col] === 'object' 
                          ? JSON.stringify(row[col]) 
                          : String(row[col] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-6">
              <div className="text-sm text-gray-600">
                Mostrando {startIndex + 1} a {Math.min(endIndex, mantenimientos.length)} de {mantenimientos.length} registros
              </div>

              <div className="flex gap-2 items-center">
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  ← Primera
                </button>

                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  ← Anterior
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-sm">Página</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={currentPage}
                    onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                    className="w-16 px-2 py-1 border rounded text-center"
                  />
                  <span className="text-sm">de {totalPages}</span>
                </div>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Siguiente →
                </button>

                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Última →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
