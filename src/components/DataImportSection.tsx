
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
  const [previewData, setPreviewData] = useState<SalesDataRow[]>([]);
  const { addNotification } = useAppContext();
  
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
  };

  useEffect(() => {
    const loadFilterOptions = async () => {
      console.log("[LOG] Iniciando la carga de opciones para filtros...");
      try {
        const [añosData, centrosData, etiquetasData] = await Promise.all([
          queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Año' }),
          queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Centro' }),
          queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Etiqueta' })
        ]);

        console.log("[LOG] Datos de filtros recibidos de la API:", { añosData, centrosData, etiquetasData });

        const currentYear = new Date().getFullYear();
        const añosSet = new Set(añosData.map((item: any) => item['Año']));
        if (!añosSet.has(currentYear)) añosSet.add(currentYear);

        const newFilterOptions = {
          años: Array.from(añosSet).sort((a,b) => b - a).map(y => ({ value: y, label: String(y) })),
          centros: centrosData.map((item: any) => ({ value: item['Centro'], label: item['Centro'] })).sort((a,b) => a.label.localeCompare(b.label)),
          etiquetas: etiquetasData.map((item: any) => ({ value: item['Etiqueta'], label: item['Etiqueta'] })).sort((a,b) => a.label.localeCompare(b.label)),
        };

        console.log("[LOG] Opciones de filtro procesadas:", newFilterOptions);

        setFilterOptions(prev => ({
          ...prev,
          ...newFilterOptions,
        }));

      } catch (error) {
        console.error("[ERROR] No se pudieron cargar las opciones para los filtros desde la API.", error);
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
                key = `${'${row.código}'} - ${'${row.descripciónMaterial}'}`;
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
    console.log("[LOG] Datos agregados para la tabla de previsualización:", aggregationResult);
    return aggregationResult;
  }, [previewData, groupBy]);

  const handlePreviewData = useCallback(async () => {
      console.log("[LOG] handlePreviewData: Iniciando previsualización con filtros:", filters);
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

          console.log("[LOG] handlePreviewData: Enviando consulta a la API con filtros:", apiFilters);
          const dataFromApi: PresupuestoItem[] = await queryApi({
            source: 'Presupuesto',
            operation: 'get_data',
            filters: apiFilters,
            pagination: { limit: 50000 }
          });
          
          if (dataFromApi.length === 0) {
              console.warn("[LOG] handlePreviewData: La API no devolvió datos.");
              addNotification('warning', 'La API no devolvió datos para los filtros seleccionados.');
              setIsProcessing(false);
              return;
          }

          console.log(`[LOG] handlePreviewData: Se recibieron ${'${dataFromApi.length}'} registros de la API.`);
          const mappedData: SalesDataRow[] = dataFromApi.map((item, index) => ({
              id: `row-${'${Date.now()}'}-${'${index}'}`,
              año: item.Año, mes: item.Mes, sector: item.Sector || 'Sin Sector',
              etiqueta: item.Etiqueta || 'Sin Etiqueta', 
              código: normalizeMaterialCode(item.CodMaterial),
              centro: String(item.Centro).trim(), unidadesProyectado: item.UnidadesProyectado,
              dolaresProyectado: item.DolaresProyectado, descripciónMaterial: item.Material,
              familia: item.Familia, marca: item.Marca, lineaProduccion: '',
          }));
          
          setPreviewData(mappedData);
          addNotification('success', `Se han pre-cargado ${'${mappedData.length}'} registros para previsualización.`);

      } catch (error) {
          console.error("[ERROR] Error al cargar datos de previsualización:", error);
          addNotification('error', `Error al cargar datos de previsualización: ${(error as Error).message}`);
      } finally {
          console.log("[LOG] handlePreviewData: Finalizó el proceso de previsualización.");
          setIsProcessing(false);
      }
  }, [filters, addNotification]);

  React.useEffect(() => {
    if (aggregatedData) {
        console.log("[LOG] useEffect[aggregatedData]: Actualizando grupos seleccionados.");
        setSelectedGroups(new Set(Object.keys(aggregatedData)));
    }
  }, [aggregatedData]);

  const handleAcceptAndLoadData = async () => {
    console.log("[LOG] handleAcceptAndLoadData: Iniciando carga final con filtros:", filters);
    setIsProcessing(true);
    addNotification('info', `Cargando datos completos para planificación...`);
    try {
        const startMonth = filters.mes ? parseInt(filters.mes, 10) : 1;

        // Perform a new, broader query for the final data load
        const finalApiFilters: { [key: string]: any } = {
            'Año': Number(filters.año)
        };
        console.log("[LOG] handleAcceptAndLoadData: Consultando datos de todo el año:", finalApiFilters);

        const allYearData: PresupuestoItem[] = await queryApi({
            source: 'Presupuesto',
            operation: 'get_data',
            filters: finalApiFilters,
            pagination: { limit: 50000 }
        });

        if (allYearData.length === 0) {
            console.error("[LOG] handleAcceptAndLoadData: No se encontraron datos para el año seleccionado.");
            addNotification('error', 'No se encontraron datos para el año seleccionado.');
            setIsProcessing(false);
            return;
        }

        console.log(`[LOG] handleAcceptAndLoadData: Se recibieron ${'${allYearData.length}'} registros para todo el año.`);
        const mappedData: SalesDataRow[] = allYearData.map((item, index) => ({
            id: `row-final-${'${Date.now()}'}-${'${index}'}`,
            año: item.Año, mes: item.Mes, sector: item.Sector || 'Sin Sector',
            etiqueta: item.Etiqueta || 'Sin Etiqueta', 
            código: normalizeMaterialCode(item.CodMaterial),
            centro: String(item.Centro).trim(), unidadesProyectado: item.UnidadesProyectado,
            dolaresProyectado: item.DolaresProyectado, descripciónMaterial: item.Material,
            familia: item.Familia, marca: item.Marca, lineaProduccion: '',
        }));

        // Filter the complete data from the start month onwards
        const dataForPlanning = mappedData.filter(row => {
            const rowDate = new Date(row.año, row.mes - 1);
            const startDate = new Date(Number(filters.año), startMonth - 1);
            return rowDate >= startDate;
        });

        if (dataForPlanning.length === 0) {
            console.warn("[LOG] handleAcceptAndLoadData: No hay datos de ventas disponibles a partir del mes seleccionado.");
            addNotification('warning', 'No hay datos de ventas disponibles a partir del mes seleccionado.');
            setIsProcessing(false);
            return;
        }
        
        console.log(`[LOG] handleAcceptAndLoadData: ${'${dataForPlanning.length}'} registros finales serán pasados a onDataImported.`);
        onDataImported(dataForPlanning);
        setPreviewData([]);
        setSelectedGroups(new Set());
    } catch (error) {
        console.error("[ERROR] Error al cargar datos para planificación:", error);
        addNotification('error', `Error al cargar datos para planificación: ${(error as Error).message}`);
    } finally {
        console.log("[LOG] handleAcceptAndLoadData: Finalizó el proceso de carga final.");
        setIsProcessing(false);
    }
  };

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


  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto de Ventas desde API</h2>
      </div>
      
      <p className="text-gray-600">
        Use los filtros para **previsualizar** una muestra de los datos y validar su correctitud. Luego, presione **Aceptar y Cargar** para iniciar la planificación con todos los datos a partir del mes y año seleccionados.
      </p>

      {/* --- Filtros --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end p-4 border rounded-lg bg-gray-50">
        <SelectField label="Año" id="año" name="año" value={filters.año} onChange={handleFilterChange} options={filterOptions.años}/>
        <SelectField label="Mes (Para previsualizar)" id="mes" name="mes" value={filters.mes} onChange={handleFilterChange} options={filterOptions.meses} title="Filtra la previsualización. La carga final comenzará desde este mes."/>
        <SelectField label="Centro (Para previsualizar)" id="centro" name="centro" value={filters.centro} onChange={handleFilterChange} options={filterOptions.centros}/>
        <SelectField label="Etiqueta (Para previsualizar)" id="etiqueta" name="etiqueta" value={filters.etiqueta} onChange={handleFilterChange} options={filterOptions.etiquetas}/>
        
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
                  {uniqueCentersInPreviewData.map(center => (
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
                    {uniqueCentersInPreviewData.map(center => (
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
                            {uniqueCentersInPreviewData.map(center => (
                                <td key={center} className="px-4 py-2 text-right font-semibold text-gray-600">
                                    {(totals.subtotalSectors[center] || 0).toLocaleString()}
                                </td>
                            ))}
                            <td className="px-4 py-2 text-right font-semibold text-gray-600">{totals.subtotalSectors.total.toLocaleString()}</td>
                        </tr>
                    
                    <tr>
                        <td colSpan={2} className="px-4 py-2 text-left font-bold text-gray-700 uppercase">Total Seleccionado</td>
                        {uniqueCentersInPreviewData.map(center => (
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
                    onClick={handleAcceptAndLoadData}
                    className="w-full md:w-auto px-6 py-2 bg-green-600 text-white font-semibold rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    disabled={isProcessing}
                >
                    Aceptar y Cargar Datos para Planificación
                </button>
           </div>
        </div>
      )}
    </div>
  );
};
