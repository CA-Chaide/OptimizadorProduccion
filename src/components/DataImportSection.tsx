

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { SalesDataRow, NotificationMessage, PresupuestoItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DataImportIcon, MAX_FILE_SIZE_MB, MONTH_NAMES } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

interface DataImportSectionProps {
  onDataImported: (data: SalesDataRow[], year: number) => void;
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
  const [previewData, setPreviewData] = useState<SalesDataRow[]>([]);
  const { addNotification, dispatch, isLoading } = useAppContext();
  
  const [filterOptions, setFilterOptions] = useState({
      años: [] as {value: number, label: string}[],
      meses: MONTH_NAMES.map((name, index) => ({ value: index + 1, label: name })),
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
      if (name === 'año' && value) {
        dispatch({ type: 'SET_YEAR', payload: parseInt(value, 10) });
      }
  };

  useEffect(() => {
    dispatch({ type: 'SET_YEAR', payload: parseInt(filters.año, 10) });
  }, []);

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

        const newFilterOptions = {
          años: Array.from(añosSet).sort((a,b) => b - a).map(y => ({ value: y, label: String(y) })),
          centros: centrosData.map((item: any) => ({ value: item['Centro'], label: item['Centro'] })).sort((a,b) => a.label.localeCompare(b.label)),
          etiquetas: etiquetasData.map((item: any) => ({ value: item['Etiqueta'], label: item['Etiqueta'] })).sort((a,b) => a.label.localeCompare(b.label)),
        };

        setFilterOptions(prev => ({
          ...prev,
          ...newFilterOptions,
        }));

      } catch (error) {
        addNotification('error', 'No se pudieron cargar las opciones para los filtros desde la API.');
      }
    };
    loadFilterOptions();
  }, [addNotification]);
  
  const uniqueCentersInPreviewData = useMemo(() => {
    if (previewData.length === 0) return [];
    const centers = new Set(previewData.map(row => row.centro));
    return Array.from(centers).sort();
  }, [previewData]);

  const aggregatedData = useMemo<AggregatedData | null>(() => {
    if (previewData.length === 0) return null;

    const aggregationResult: AggregatedData = {};
    previewData.forEach(row => {
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
        
        const centerName = row.centro;
        if (!aggregationResult[key].unitsByCenter[centerName]) {
            aggregationResult[key].unitsByCenter[centerName] = 0;
        }
        aggregationResult[key].unitsByCenter[centerName] += row.unidadesProyectado;
    });
    return aggregationResult;
  }, [previewData, groupBy]);

  const handlePreviewData = useCallback(async () => {
      setIsProcessing(true);
      setPreviewData([]);
      setSelectedGroups(new Set()); 
      addNotification('info', `Consultando datos de previsualización desde la API...`);

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
              setIsProcessing(false);
              return;
          }

          const mappedData: SalesDataRow[] = dataFromApi.map((item, index) => ({
              id: `row-${Date.now()}-${index}`,
              año: item.Año, mes: item.Mes, sector: item.Sector || 'Sin Sector',
              etiqueta: item.Etiqueta || 'Sin Etiqueta', 
              código: normalizeMaterialCode(item.CodMaterial),
              centro: String(item.Centro).trim(), unidadesProyectado: item.UnidadesProyectado,
              dolaresProyectado: 0, // DolaresProyectado is string, converting to 0 for now.
              descripciónMaterial: item.Material,
              familia: item.Familia, marca: item.Marca, lineaProduccion: '',
          }));
          console.log('[DataImportSection] Mapped data for preview:', mappedData);
          setPreviewData(mappedData);
          addNotification('success', `Se han pre-cargado ${mappedData.length} registros para previsualización.`);

      } catch (error) {
          addNotification('error', `Error al cargar datos de previsualización: ${(error as Error).message}`);
      } finally {
          setIsProcessing(false);
      }
  }, [filters, addNotification]);

  React.useEffect(() => {
    if (aggregatedData) {
        setSelectedGroups(new Set(Object.keys(aggregatedData)));
    }
  }, [aggregatedData]);


  const handleGroupSelection = (groupKey: string, isSelected: boolean) => {
      setSelectedGroups(prev => {
          const newSet = new Set(prev);
          if (isSelected) newSet.add(groupKey);
          else newSet.delete(groupKey);
          return newSet;
      });
  };

  const handleSelectAllGroups = (isSelected: boolean) => {
      if (aggregatedData) {
          setSelectedGroups(isSelected ? new Set(Object.keys(aggregatedData)) : new Set());
      }
  };

  const totals = useMemo(() => {
      const result = {
          subtotalSectors: uniqueCentersInPreviewData.reduce((acc, center) => ({ ...acc, [center]: 0 }), { total: 0 } as { [centerName: string]: number; total: number }),
          selectedTotal: uniqueCentersInPreviewData.reduce((acc, center) => ({ ...acc, [center]: 0 }), { total: 0 } as { [centerName: string]: number; total: number }),
      };

      if (!aggregatedData) return result;

      const targetSectorPrefixes = ['01', '02', '03'];
      
      Object.entries(aggregatedData).forEach(([key, value]) => {
          if (targetSectorPrefixes.some(prefix => key.startsWith(prefix))) {
              result.subtotalSectors.total += value.totalUnits;
              uniqueCentersInPreviewData.forEach(center => {
                  result.subtotalSectors[center] += (value.unitsByCenter[center] || 0);
              });
          }

          if (selectedGroups.has(key)) {
              result.selectedTotal.total += value.totalUnits;
              uniqueCentersInPreviewData.forEach(center => {
                  result.selectedTotal[center] += (value.unitsByCenter[center] || 0);
              });
          }
      });

      return result;
  }, [aggregatedData, selectedGroups, uniqueCentersInPreviewData]);

  const handleAcceptAndLoadData = () => {
    if (!aggregatedData) {
        addNotification('warning', 'No hay datos previsualizados para cargar.');
        return;
    }
    const year = parseInt(filters.año, 10);
     if (isNaN(year)) {
        addNotification('error', 'El año seleccionado no es válido.');
        return;
    }

    const dataToLoad = Object.entries(aggregatedData)
      .filter(([key]) => selectedGroups.has(key))
      .flatMap(([, value]) => value.dataRows);

    if (dataToLoad.length === 0) {
      addNotification('warning', 'No ha seleccionado ningún grupo para cargar. Por favor, marque las casillas de los grupos que desea incluir en el plan.');
      return;
    }

    onDataImported(dataToLoad, year);
    // The notification is now handled in the AppProvider after full load.
  };


  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto de Ventas desde API</h2>
      </div>
      
      <p className="text-gray-600">
        Utilice los filtros para **previsualizar** los datos de ventas. Luego, seleccione los grupos que desea incluir y presione "Usar estos Datos para Planificar".
      </p>

      {/* --- Filtros --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end p-4 border rounded-lg bg-gray-50">
        <SelectField label="Año de Planificación" id="año" name="año" value={filters.año} onChange={handleFilterChange} options={filterOptions.años}/>
        <SelectField label="Mes (Opcional)" id="mes" name="mes" value={filters.mes} onChange={handleFilterChange} options={filterOptions.meses}/>
        <SelectField label="Centro (Opcional)" id="centro" name="centro" value={filters.centro} onChange={handleFilterChange} options={filterOptions.centros}/>
        <SelectField label="Etiqueta (Opcional)" id="etiqueta" name="etiqueta" value={filters.etiqueta} onChange={handleFilterChange} options={filterOptions.etiquetas}/>
        
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
            <h3 className="text-lg font-medium text-gray-700 mb-2">Resumen de Datos Previsualizados</h3>
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

          <div className="overflow-auto bg-gray-50 p-3 rounded-md shadow max-h-[55vh] relative">
            <table className="min-w-full text-sm table-fixed">
              <thead className="bg-gray-200 sticky top-0 z-20">
                <tr>
                  <th className="p-2 w-10 text-left bg-inherit">
                      <input 
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        checked={aggregatedData ? selectedGroups.size === Object.keys(aggregatedData).length : false}
                        onChange={(e) => handleSelectAllGroups(e.target.checked)}
                      />
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider bg-inherit">{groupBy === 'sector' ? 'Sector' : (groupBy === 'etiqueta' ? 'Etiqueta' : 'Material')}</th>
                  {uniqueCentersInPreviewData.map(center => (
                    <th key={center} className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider bg-inherit">{center}</th>
                  ))}
                  <th className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider bg-inherit">Unidades Totales</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(aggregatedData).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)).map(([key, value]) => (
                  <tr key={key}>
                    <td className="p-2 w-10">
                        <input 
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            checked={selectedGroups.has(key)}
                            onChange={(e) => handleGroupSelection(key, e.target.checked)}
                        />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap font-medium">{key}</td>
                    {uniqueCentersInPreviewData.map(center => (
                        <td key={center} className="px-4 py-2 whitespace-nowrap text-right">
                            {(value.unitsByCenter[center] || 0).toLocaleString()}
                        </td>
                    ))}
                    <td className="px-4 py-2 whitespace-nowrap text-right font-bold">{value.totalUnits.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
               <tfoot className="bg-gray-200 sticky bottom-0 z-20">
                    <tr className="border-t-2 border-gray-400">
                        <td colSpan={2} className="px-4 py-2 text-left font-semibold text-gray-600 uppercase bg-inherit">Subtotal Sectores 01-03</td>
                        {uniqueCentersInPreviewData.map(center => (
                            <td key={center} className="px-4 py-2 text-right font-semibold text-gray-600 bg-inherit">
                                {(totals.subtotalSectors[center] || 0).toLocaleString()}
                            </td>
                        ))}
                        <td className="px-4 py-2 text-right font-semibold text-gray-600 bg-inherit">{totals.subtotalSectors.total.toLocaleString()}</td>
                    </tr>
                    
                    <tr>
                        <td colSpan={2} className="px-4 py-2 text-left font-bold text-gray-700 uppercase bg-inherit">Total Seleccionado</td>
                        {uniqueCentersInPreviewData.map(center => (
                            <td key={center} className="px-4 py-2 text-right font-bold text-gray-700 bg-inherit">
                                {(totals.selectedTotal[center] || 0).toLocaleString()}
                            </td>
                        ))}
                        <td className="px-4 py-2 text-right font-bold text-gray-700 bg-inherit">{totals.selectedTotal.total.toLocaleString()}</td>
                    </tr>
               </tfoot>
            </table>
          </div>
          <div className="pt-4 flex justify-end">
            <button
                onClick={handleAcceptAndLoadData}
                disabled={isLoading || isProcessing || previewData.length === 0}
                className="px-6 py-3 bg-green-600 text-white font-bold rounded-md shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                {isLoading ? 'Cargando datos...' : 'Usar estos Datos para Planificar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
