
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { SalesDataRow, NotificationMessage, PresupuestoItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DataImportIcon, MAX_FILE_SIZE_MB, MONTH_NAMES } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

interface DataImportSectionProps {
  onDataImported: (data: SalesDataRow[]) => void;
}

type GroupByOption = 'sector' | 'etiqueta' | 'material';

// Updated data structure to hold totals per center
interface AggregatedData {
  [key: string]: {
    totalUnits: number;
    unitsByCenter: { [centerName: string]: number };
    // This new property will help in subtotal calculation regardless of grouping
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
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [fetchedData, setFetchedData] = useState<SalesDataRow[]>([]);
  const { addNotification } = useAppContext();
  
  const [filterOptions, setFilterOptions] = useState({
      años: [] as {value: number, label: string}[],
      meses: MONTH_NAMES.map((m, i) => ({ value: i + 1, label: m })),
      centros: [] as {value: string, label: string}[],
      etiquetas: [] as {value: string, label: string}[],
  });

  const [filters, setFilters] = useState({
      año: new Date().getFullYear().toString(),
      mes: '',
      centro: '',
      etiqueta: ''
  });
  const [groupBy, setGroupBy] = useState<GroupByOption>('sector');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());


  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Cargar datos para los filtros una sola vez
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [añosData, centrosData, etiquetasData] = await Promise.all([
          queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Año' }),
          queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Centro' }),
          queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Etiqueta' })
        ]);

        const currentYear = new Date().getFullYear();
        const añosSet = new Set(añosData.map((item: any) => item['Año']));
        if (!añosSet.has(currentYear)) añosSet.add(currentYear);

        setFilterOptions(prev => ({
          ...prev,
          años: Array.from(añosSet).sort((a,b) => b - a).map(y => ({ value: y, label: String(y) })),
          centros: centrosData.map((item: any) => ({ value: item['Centro'], label: item['Centro'] })).sort((a,b) => a.label.localeCompare(b.label)),
          etiquetas: etiquetasData.map((item: any) => ({ value: item['Etiqueta'], label: item['Etiqueta'] })).sort((a,b) => a.label.localeCompare(b.label)),
        }));

      } catch (error) {
        addNotification('error', 'No se pudieron cargar las opciones para los filtros desde la API.');
      }
    };
    loadFilterOptions();
  }, [addNotification]);


  // Get a list of unique centers from the fetched data to build table columns
  const uniqueCentersInFetchedData = useMemo(() => {
    if (fetchedData.length === 0) return [];
    const centers = new Set(fetchedData.map(row => row.centro));
    return Array.from(centers).sort();
  }, [fetchedData]);

  const aggregatedData = useMemo<AggregatedData | null>(() => {
    if (fetchedData.length === 0) return null;

    const aggregationResult: AggregatedData = {};
    fetchedData.forEach(row => {
        let key: string;
        switch (groupBy) {
            case 'sector':
                key = row.sector || 'Sin Sector';
                break;
            case 'etiqueta':
                key = row.etiqueta || 'Sin Etiqueta';
                break;
            case 'material':
                key = `${row.código} - ${row.descripciónMaterial}`;
                break;
            default:
                key = 'Sin Asignar';
        }

        if (!aggregationResult[key]) {
            aggregationResult[key] = { totalUnits: 0, unitsByCenter: {}, dataRows: [] };
        }
        aggregationResult[key].totalUnits += row.unidadesProyectado;
        aggregationResult[key].dataRows.push(row);
        
        // Aggregate by center
        const centerName = row.centro;
        if (!aggregationResult[key].unitsByCenter[centerName]) {
            aggregationResult[key].unitsByCenter[centerName] = 0;
        }
        aggregationResult[key].unitsByCenter[centerName] += row.unidadesProyectado;
    });
    return aggregationResult;
  }, [fetchedData, groupBy]);

  const handlePreviewData = useCallback(async () => {
      setIsProcessing(true);
      setFetchedData([]);
      setSelectedGroups(new Set()); // Reset selection
      addNotification('info', `Consultando datos desde la API...`);

      try {
          const apiFilters: { [key: string]: any } = {};
          if(filters.año) apiFilters['Año'] = Number(filters.año);
          if(filters.mes) apiFilters['Mes'] = Number(filters.mes);
          if(filters.centro) apiFilters['Centro'] = filters.centro;
          if(filters.etiqueta) apiFilters['Etiqueta'] = filters.etiqueta;

          const dataFromApi: PresupuestoItem[] = await queryApi({
            source: 'Presupuesto',
            operation: 'get_data',
            filters: apiFilters,
            pagination: { limit: 50000 }
          });
          
          if (dataFromApi.length === 0) {
              addNotification('warning', 'La API no devolvió datos para los filtros seleccionados.');
              return;
          }

          const mappedData: SalesDataRow[] = dataFromApi.map((item, index) => ({
              id: `row-${Date.now()}-${index}`,
              año: item.Año, mes: item.Mes, sector: item.Sector || 'Sin Sector',
              etiqueta: item.Etiqueta || 'Sin Etiqueta', 
              código: normalizeMaterialCode(item.CodMaterial), // <-- NORMALIZATION HERE
              centro: String(item.Centro).trim(), unidadesProyectado: item.UnidadesProyectado,
              dolaresProyectado: item.DolaresProyectado, descripciónMaterial: item.Material,
              familia: item.Familia, marca: item.Marca, lineaProduccion: '',
          }));
          
          setFetchedData(mappedData);
          addNotification('success', `Se han pre-cargado ${mappedData.length} registros. Seleccione los grupos y acepte para continuar.`);

      } catch (error) {
          console.error("Error fetching from API:", error);
          addNotification('error', `Error al cargar datos desde la API: ${(error as Error).message}`);
      } finally {
          setIsProcessing(false);
      }
  }, [filters, addNotification]);

  // When aggregation changes, pre-select all groups
  React.useEffect(() => {
    if (aggregatedData) {
        setSelectedGroups(new Set(Object.keys(aggregatedData)));
    }
  }, [aggregatedData]);

  const handleAcceptData = () => {
    if(fetchedData.length > 0) {
        if(selectedGroups.size === 0) {
            addNotification('warning', 'Debe seleccionar al menos un grupo para cargar.');
            return;
        }
        
        const dataToLoad = fetchedData.filter(row => {
             let key: string;
            switch (groupBy) {
                case 'sector':
                    key = row.sector || 'Sin Sector';
                    break;
                case 'etiqueta':
                    key = row.etiqueta || 'Sin Etiqueta';
                    break;
                case 'material':
                    key = `${row.código} - ${row.descripciónMaterial}`;
                    break;
                default:
                    key = 'Sin Asignar';
            }
            return selectedGroups.has(key);
        });

        
        onDataImported(dataToLoad);
        setFetchedData([]);
        setSelectedGroups(new Set());
    } else {
        addNotification('error', 'No hay datos para cargar. Por favor, genere una previsualización primero.');
    }
  };

  const handleGroupSelection = (groupKey: string, isSelected: boolean) => {
      setSelectedGroups(prev => {
          const newSet = new Set(prev);
          if (isSelected) {
              newSet.add(groupKey);
          } else {
              newSet.delete(groupKey);
          }
          return newSet;
      });
  };

  const handleSelectAllGroups = (isSelected: boolean) => {
      if (aggregatedData) {
          if (isSelected) {
              setSelectedGroups(new Set(Object.keys(aggregatedData)));
          } else {
              setSelectedGroups(new Set());
          }
      }
  };

  const totals = useMemo(() => {
      const result = {
          subtotalSectors: uniqueCentersInFetchedData.reduce((acc, center) => ({ ...acc, [center]: 0 }), { total: 0 } as { [centerName: string]: number; total: number }),
          selectedTotal: uniqueCentersInFetchedData.reduce((acc, center) => ({ ...acc, [center]: 0 }), { total: 0 } as { [centerName: string]: number; total: number }),
      };

      if (!aggregatedData) return result;

      // Calculate subtotal for specific sectors (01, 02, 03) directly from the source data
      const targetSectorPrefixes = ['01', '02', '03'];
      fetchedData.forEach(row => {
          if (targetSectorPrefixes.some(prefix => row.sector.startsWith(prefix))) {
              result.subtotalSectors.total += row.unidadesProyectado;
              if (result.subtotalSectors[row.centro] !== undefined) {
                  result.subtotalSectors[row.centro] += row.unidadesProyectado;
              }
          }
      });

      // Calculate total for selected groups
      Object.entries(aggregatedData).forEach(([key, value]) => {
          if (selectedGroups.has(key)) {
              result.selectedTotal.total += value.totalUnits;
              uniqueCentersInFetchedData.forEach(center => {
                  result.selectedTotal[center] += (value.unitsByCenter[center] || 0);
              });
          }
      });

      return result;
  }, [aggregatedData, selectedGroups, fetchedData, uniqueCentersInFetchedData]);


  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto de Ventas desde API</h2>
      </div>
      
      <p className="text-gray-600">
        Seleccione los filtros para consultar los datos. Luego, podrá previsualizar, seleccionar los grupos de interés y finalmente cargar los datos en el sistema.
      </p>

      {/* --- Filtros --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end p-4 border rounded-lg bg-gray-50">
        <SelectField label="Año" id="año" name="año" value={filters.año} onChange={handleFilterChange} options={filterOptions.años}/>
        <SelectField label="Mes" id="mes" name="mes" value={filters.mes} onChange={handleFilterChange} options={filterOptions.meses}/>
        <SelectField label="Centro" id="centro" name="centro" value={filters.centro} onChange={handleFilterChange} options={filterOptions.centros}/>
        <SelectField label="Etiqueta" id="etiqueta" name="etiqueta" value={filters.etiqueta} onChange={handleFilterChange} options={filterOptions.etiquetas}/>
        
        <button
            onClick={handlePreviewData}
            disabled={isProcessing}
            className="w-full h-10 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
        >
            {isProcessing ? 'Consultando...' : 'Previsualizar'}
        </button>
      </div>


      {aggregatedData && (
        <div className="mt-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">Resumen de Datos a Cargar</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-1">
                    <label htmlFor="groupBy" className="block text-sm font-medium text-gray-700">Agrupar por</label>
                    <select id="groupBy" value={groupBy} onChange={e => setGroupBy(e.target.value as GroupByOption)} className="w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                        <option value="sector">Sector</option>
                        <option value="etiqueta">Etiqueta</option>
                        <option value="material">Material</option>
                    </select>
                </div>
            </div>
          </div>

          <div className="overflow-x-auto bg-gray-50 p-3 rounded-md shadow max-h-[50vh]">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="p-2 w-10 text-left">
                      <input 
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        checked={aggregatedData ? selectedGroups.size === Object.keys(aggregatedData).length : false}
                        onChange={(e) => handleSelectAllGroups(e.target.checked)}
                      />
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">{groupBy === 'sector' ? 'Sector' : (groupBy === 'etiqueta' ? 'Etiqueta' : 'Material')}</th>
                  {uniqueCentersInFetchedData.map(center => (
                    <th key={center} className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">{center}</th>
                  ))}
                  <th className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Unidades Totales</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(aggregatedData).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)).map(([key, value]) => (
                  <tr key={key}>
                    <td className="p-2">
                        <input 
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            checked={selectedGroups.has(key)}
                            onChange={(e) => handleGroupSelection(key, e.target.checked)}
                        />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap font-medium">{key}</td>
                    {uniqueCentersInFetchedData.map(center => (
                        <td key={center} className="px-4 py-2 whitespace-nowrap text-right">
                            {(value.unitsByCenter[center] || 0).toLocaleString()}
                        </td>
                    ))}
                    <td className="px-4 py-2 whitespace-nowrap text-right font-bold">{value.totalUnits.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
               <tfoot className="bg-gray-200 sticky bottom-0 z-10">
                    
                        <tr className="border-t-2 border-gray-400">
                            <td colSpan={2} className="px-4 py-2 text-left font-semibold text-gray-600 uppercase">Subtotal Sectores 01-03</td>
                            {uniqueCentersInFetchedData.map(center => (
                                <td key={center} className="px-4 py-2 text-right font-semibold text-gray-600">
                                    {(totals.subtotalSectors[center] || 0).toLocaleString()}
                                </td>
                            ))}
                            <td className="px-4 py-2 text-right font-semibold text-gray-600">{totals.subtotalSectors.total.toLocaleString()}</td>
                        </tr>
                    
                    <tr>
                        <td colSpan={2} className="px-4 py-2 text-left font-bold text-gray-700 uppercase">Total Seleccionado</td>
                        {uniqueCentersInFetchedData.map(center => (
                            <td key={center} className="px-4 py-2 text-right font-bold text-gray-700">
                                {(totals.selectedTotal[center] || 0).toLocaleString()}
                            </td>
                        ))}
                        <td className="px-4 py-2 text-right font-bold text-gray-700">{totals.selectedTotal.total.toLocaleString()}</td>
                    </tr>
               </tfoot>
            </table>
          </div>

           <div className="flex justify-end pt-4">
                <button
                    onClick={handleAcceptData}
                    className="w-full md:w-auto px-6 py-2 bg-green-600 text-white font-semibold rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    disabled={selectedGroups.size === 0}
                >
                    Aceptar y Continuar ({selectedGroups.size} grupos)
                </button>
           </div>
        </div>
      )}
    </div>
  );
};
