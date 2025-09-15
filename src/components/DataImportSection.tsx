

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { SalesDataRow, NotificationMessage, PresupuestoItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DataImportIcon, MAX_FILE_SIZE_MB, MONTH_NAMES } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

interface DataImportSectionProps {
  onDataImported: (data: SalesDataRow[]) => void;
}

type GroupByOption = 'sector' | 'etiqueta' | 'material';

interface AggregatedData {
  [key: string]: {
    totalUnits: number;
    unitsByCenter: { [centerName: string]: number };
    dataRows: SalesDataRow[];
  };
}

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

// --- Componentes UI Reutilizables ---
const SelectField: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: Array<{value: string | number; label: string}>; containerClassName?: string }> = ({ label, id, options, containerClassName, ...props }) => (
    <div className={containerClassName || ""}>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <select id={id} {...props} className={`w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${props.disabled ? 'bg-gray-100' : ''}`}>
            <option value="">Todos</option>
            {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);


export const DataImportSection: React.FC<DataImportSectionProps> = ({ onDataImported }) => {
  const { addNotification, isLoading: isAppLoading } = useAppContext();
  
  const [filterOptions, setFilterOptions] = useState({
      años: [] as {value: number, label: string}[],
      centros: [] as {value: string, label: string}[],
      etiquetas: [] as {value: string, label: string}[],
  });

  const [filters, setFilters] = useState({
      año: new Date().getFullYear().toString(),
      mes: '',
      centro: '',
      etiqueta: '',
  });

  const [loadedData, setLoadedData] = useState<SalesDataRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFilters(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [añosData, centrosData, etiquetasData] = await Promise.all([
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Año' }),
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Centro' }),
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Etiqueta' })
        ]);

        const newFilterOptions = {
          años: añosData.map((item: any) => ({ value: item['Año'], label: String(item['Año']) })).sort((a:any,b:any) => b.value - a.value),
          centros: centrosData.map((item: any) => ({ value: item['Centro'], label: item['Centro'] })),
          etiquetas: etiquetasData.map((item: any) => ({ value: item['Etiqueta'], label: item['Etiqueta'] })),
        };
        setFilterOptions(newFilterOptions);
      } catch (error) {
        addNotification('error', 'No se pudieron cargar las opciones para los filtros desde la API.');
      }
    };
    loadFilterOptions();
  }, [addNotification]);
  
  const handleLoadData = async () => {
    setIsProcessing(true);
    setLoadedData([]);
    let finalData: SalesDataRow[] = [];

    try {
      const baseFilters: { [key: string]: any } = {};
      if (filters.año) baseFilters['Año'] = parseInt(filters.año, 10);
      if (filters.centro) baseFilters['Centro'] = filters.centro;
      if (filters.etiqueta) baseFilters['Etiqueta'] = filters.etiqueta;

      if (!filters.mes) { // Carga de año completo
        addNotification('info', `Iniciando carga completa para el año ${filters.año}...`);
        for (let month = 1; month <= 12; month++) {
          console.log(`Cargando datos para el mes ${month}/${filters.año}...`);
          addNotification('info', `Cargando mes ${month}/12...`);
          
          const monthFilters = { ...baseFilters, 'Mes': month };
          const response: PresupuestoItem[] = await queryApi({
            source: 'Presupuesto',
            operation: 'get_data',
            filters: monthFilters,
            pagination: { limit: 50000 }
          });
          
          if (response && response.length > 0) {
            console.log(`Mes ${month} cargado con ${response.length} registros.`);
            const mappedData: SalesDataRow[] = response.map((item, index) => ({
              id: `row-${item.Año}-${item.Mes}-${index}`,
              año: item.Año, mes: item.Mes, sector: item.Sector || 'Sin Sector',
              etiqueta: item.Etiqueta || 'Sin Etiqueta',
              código: normalizeMaterialCode(item.CodMaterial),
              centro: String(item.Centro).trim(), unidadesProyectado: item.UnidadesProyectado,
              dolaresProyectado: 0,
              descripciónMaterial: item.Material,
              familia: item.Familia, marca: item.Marca, lineaProduccion: '',
            }));
            finalData = [...finalData, ...mappedData];
            console.log(`Total acumulado hasta ahora: ${finalData.length}`);
          }
        }
      } else { // Carga filtrada
        addNotification('info', 'Consultando datos filtrados...');
        const queryFilters = { ...baseFilters, 'Mes': parseInt(filters.mes, 10) };
        const response: PresupuestoItem[] = await queryApi({
          source: 'Presupuesto',
          operation: 'get_data',
          filters: queryFilters,
          pagination: { limit: 50000 }
        });
        if (response && response.length > 0) {
          const mappedData: SalesDataRow[] = response.map((item, index) => ({
            id: `row-${item.Año}-${item.Mes}-${index}`,
            año: item.Año, mes: item.Mes, sector: item.Sector || 'Sin Sector',
            etiqueta: item.Etiqueta || 'Sin Etiqueta',
            código: normalizeMaterialCode(item.CodMaterial),
            centro: String(item.Centro).trim(), unidadesProyectado: item.UnidadesProyectado,
            dolaresProyectado: 0,
            descripciónMaterial: item.Material,
            familia: item.Familia, marca: item.Marca, lineaProduccion: '',
          }));
          finalData = mappedData;
        }
      }

      if (finalData.length > 0) {
        setLoadedData(finalData);
        onDataImported(finalData); // Esto ahora solo notifica y guarda en el estado global
        addNotification('success', `Carga completada. Se importaron ${finalData.length} registros.`);
      } else {
        addNotification('warning', 'No se encontraron registros con los filtros seleccionados.');
      }
    } catch (error) {
        addNotification('error', `Error durante la carga de datos: ${(error as Error).message}`);
    } finally {
        setIsProcessing(false);
    }
  };
  
  const { aggregatedData, centers } = useMemo(() => {
    const data: AggregatedData = {};
    const centerSet = new Set<string>();

    loadedData.forEach(row => {
      const key = row.etiqueta;
      if (!data[key]) {
        data[key] = { totalUnits: 0, unitsByCenter: {}, dataRows: [] };
      }
      data[key].totalUnits += row.unidadesProyectado;
      data[key].unitsByCenter[row.centro] = (data[key].unitsByCenter[row.centro] || 0) + row.unidadesProyectado;
      data[key].dataRows.push(row);
      centerSet.add(row.centro);
    });

    return { aggregatedData: data, centers: Array.from(centerSet).sort() };
  }, [loadedData]);

  const footerTotals = useMemo(() => {
    const totals: { [centerName: string]: number } = {};
    let grandTotal = 0;
    Object.values(aggregatedData).forEach(group => {
      Object.entries(group.unitsByCenter).forEach(([center, units]) => {
        totals[center] = (totals[center] || 0) + units;
      });
      grandTotal += group.totalUnits;
    });
    return { ...totals, grandTotal };
  }, [aggregatedData]);

  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto de Ventas desde API</h2>
      </div>
      
      <p className="text-gray-600">
        Use los filtros para definir el alcance de los datos. Si deja el campo "Mes" vacío, se cargarán todos los meses del año seleccionado.
      </p>

      {/* --- Filtros --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end p-4 border rounded-lg bg-gray-50">
        <SelectField label="Año" id="año" name="año" value={filters.año} onChange={handleFilterChange} options={filterOptions.años}/>
        <SelectField label="Mes" id="mes" name="mes" value={filters.mes} onChange={handleFilterChange} options={MONTH_NAMES.map((m, i) => ({ value: i + 1, label: m }))}/>
        <SelectField label="Centro" id="centro" name="centro" value={filters.centro} onChange={handleFilterChange} options={filterOptions.centros}/>
        <SelectField label="Etiqueta" id="etiqueta" name="etiqueta" value={filters.etiqueta} onChange={handleFilterChange} options={filterOptions.etiquetas}/>
        
        <div className="flex flex-col">
            <button
                onClick={handleLoadData}
                disabled={isProcessing || isAppLoading || !filters.año}
                className="w-full h-10 px-4 py-2 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                {isProcessing ? 'Cargando...' : 'Cargar Datos'}
            </button>
        </div>
      </div>

       {loadedData.length > 0 && (
         <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Datos Cargados y Agrupados por Etiqueta</h3>
            <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider bg-gray-100">Etiqueta</th>
                            {centers.map(center => (
                                <th key={center} className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider bg-gray-100">{center}</th>
                            ))}
                            <th className="px-3 py-2 text-right font-bold text-gray-700 uppercase tracking-wider bg-gray-100">Total Unidades</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                       {Object.entries(aggregatedData).map(([etiqueta, group]) => (
                            <tr key={etiqueta}>
                                <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{etiqueta}</td>
                                {centers.map(center => (
                                    <td key={`${etiqueta}-${center}`} className="px-3 py-2 text-right text-gray-600">{group.unitsByCenter[center]?.toLocaleString() || 0}</td>
                                ))}
                                <td className="px-3 py-2 text-right font-bold text-gray-900">{group.totalUnits.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-200 sticky bottom-0 z-10">
                        <tr>
                            <th className="px-3 py-2 text-left font-bold text-gray-700 uppercase tracking-wider">TOTAL</th>
                             {centers.map(center => (
                                <th key={`total-${center}`} className="px-3 py-2 text-right font-bold text-gray-700 uppercase tracking-wider">
                                    {(footerTotals[center] || 0).toLocaleString()}
                                </th>
                            ))}
                             <th className="px-3 py-2 text-right font-bold text-indigo-700 uppercase tracking-wider">
                                {footerTotals.grandTotal.toLocaleString()}
                            </th>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
      )}
    </div>
  );
};
