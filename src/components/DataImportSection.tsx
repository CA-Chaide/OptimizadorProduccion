
import React, { useState, useCallback, useMemo } from 'react';
import { SalesDataRow, NotificationMessage, PresupuestoItem } from '@/types/types';
import { fetchPresupuestoData } from '@/hooks/useApiData';
import { DataImportIcon, MAX_FILE_SIZE_MB, MONTH_NAMES } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

interface DataImportSectionProps {
  onDataImported: (data: SalesDataRow[]) => void;
}

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
  const [importedDataPreview, setImportedDataPreview] = useState<SalesDataRow[]>([]);
  const { addNotification } = useAppContext();

  const [filterData, setFilterData] = useState<PresupuestoItem[]>([]);
  const [filters, setFilters] = useState({
      año: new Date().getFullYear().toString(),
      mes: '',
      centro: '',
      etiqueta: ''
  });

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Cargar datos para los filtros una sola vez
  React.useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        // Podríamos cargar un subconjunto, pero por simplicidad inicial, cargamos todo
        // para asegurar que los filtros sean exhaustivos.
        // En una implementación más avanzada, se podrían tener endpoints de API
        // dedicados a obtener solo los valores únicos para los filtros.
        const data = await fetchPresupuestoData({ limit: 5000 }); // Limite para no sobrecargar
        setFilterData(data);
      } catch (error) {
        addNotification('error', 'No se pudieron cargar las opciones para los filtros desde la API.');
      }
    };
    loadFilterOptions();
  }, [addNotification]);

  // Opciones memoizadas para los dropdowns de filtros
  const filterOptions = useMemo(() => {
      const años = new Set<number>();
      const centros = new Set<string>();
      const etiquetas = new Set<string>();

      filterData.forEach(item => {
          años.add(item.Año);
          centros.add(item.Centro);
          etiquetas.add(item.Etiqueta);
      });
      
      const currentYear = new Date().getFullYear();
      if (!años.has(currentYear)) años.add(currentYear);


      return {
          años: Array.from(años).sort((a,b) => b - a).map(y => ({ value: y, label: String(y) })),
          meses: MONTH_NAMES.map((m, i) => ({ value: i + 1, label: m })),
          centros: Array.from(centros).sort().map(c => ({ value: c, label: c })),
          etiquetas: Array.from(etiquetas).sort().map(e => ({ value: e, label: e })),
      };
  }, [filterData]);


  const handleLoadData = useCallback(async () => {
      setIsProcessing(true);
      addNotification('info', `Cargando datos desde la API...`);

      try {
          const apiParams = {
              limit: 10000, // Un límite alto para traer todos los datos relevantes
              año: filters.año ? Number(filters.año) : undefined,
              mes: filters.mes ? Number(filters.mes) : undefined,
              centro: filters.centro || undefined,
              etiqueta: filters.etiqueta || undefined,
          };
          const dataFromApi = await fetchPresupuestoData(apiParams);
          
          if (dataFromApi.length === 0) {
              addNotification('warning', 'La API no devolvió datos para los filtros seleccionados.');
              setImportedDataPreview([]);
              onDataImported([]);
              return;
          }

          // Mapear los datos de la API a la estructura SalesDataRow que la app espera
          const mappedData: SalesDataRow[] = dataFromApi.map((item, index) => ({
              id: `row-${Date.now()}-${index}`,
              año: item.Año,
              mes: item.Mes,
              sector: item.Sector,
              etiqueta: item.Etiqueta,
              código: item.CodMaterial.trim(),
              centro: item.Centro.trim(),
              unidadesProyectado: item.UnidadesProyectado,
              dolaresProyectado: item.DolaresProyectado,
              descripciónMaterial: item.Material,
              familia: item.Familia,
              marca: item.Marca,
              lineaProduccion: '', // Este campo no viene de la API, se deja vacío
          }));

          setImportedDataPreview(mappedData.slice(0, 10)); // Vista previa
          onDataImported(mappedData); // Enviar todos los datos mapeados

      } catch (error) {
          console.error("Error fetching from API:", error);
          addNotification('error', `Error al cargar datos desde la API: ${(error as Error).message}`);
          setImportedDataPreview([]);
      } finally {
          setIsProcessing(false);
      }
  }, [filters, onDataImported, addNotification]);

  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto de Ventas desde API</h2>
      </div>
      
      <p className="text-gray-600">
        Seleccione los filtros para consultar los datos de ventas directamente desde la fuente de datos oficial. 
        Haga clic en "Cargar Datos" para iniciar el proceso.
      </p>

      {/* --- Filtros --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end p-4 border rounded-lg bg-gray-50">
        <SelectField label="Año" id="año" name="año" value={filters.año} onChange={handleFilterChange} options={filterOptions.años}/>
        <SelectField label="Mes" id="mes" name="mes" value={filters.mes} onChange={handleFilterChange} options={filterOptions.meses}/>
        <SelectField label="Centro" id="centro" name="centro" value={filters.centro} onChange={handleFilterChange} options={filterOptions.centros}/>
        <SelectField label="Etiqueta" id="etiqueta" name="etiqueta" value={filters.etiqueta} onChange={handleFilterChange} options={filterOptions.etiquetas} containerClassName="md:col-span-2 lg:col-span-1"/>
        
        <button
            onClick={handleLoadData}
            disabled={isProcessing}
            className="w-full h-10 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
        >
            {isProcessing ? 'Cargando...' : 'Cargar Datos'}
        </button>
      </div>


      {importedDataPreview.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-700 mb-2">Vista Previa de Datos Cargados (primeras {importedDataPreview.length} filas):</h3>
          <div className="overflow-x-auto bg-gray-50 p-3 rounded-md shadow">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  {Object.keys(importedDataPreview[0] || {}).filter(key => key !== 'id').map(key => (
                    <th key={key} className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {importedDataPreview.map((row) => (
                  <tr key={row.id}>
                    {Object.entries(row).filter(([key]) => key !== 'id').map(([key, value]) => (
                      <td key={key} className="px-4 py-2 whitespace-nowrap">{String(value)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
