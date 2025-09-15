

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { SalesDataRow, NotificationMessage, PresupuestoItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DataImportIcon, MAX_FILE_SIZE_MB, MONTH_NAMES } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

interface DataImportSectionProps {
  onDataImported: (year: number) => void;
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
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const { addNotification, dispatch, isLoading } = useAppContext();
  
  const [filterOptions, setFilterOptions] = useState({
      años: [] as {value: number, label: string}[],
  });

  const [filters, setFilters] = useState({
      año: new Date().getFullYear().toString(),
  });

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
        const añosData = await queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Año' });
        const currentYear = new Date().getFullYear();
        const añosSet = new Set(añosData.map((item: any) => item['Año']));
        if (!añosSet.has(currentYear)) añosSet.add(currentYear);
        const newFilterOptions = {
          años: Array.from(añosSet).sort((a,b) => b - a).map(y => ({ value: y, label: String(y) })),
        };
        setFilterOptions(newFilterOptions);
      } catch (error) {
        addNotification('error', 'No se pudieron cargar las opciones para los filtros desde la API.');
      }
    };
    loadFilterOptions();
  }, [addNotification]);
  
  const handleLoadFullYear = () => {
    const year = parseInt(filters.año, 10);
    if (isNaN(year)) {
      addNotification('error', 'El año seleccionado no es válido.');
      return;
    }
    console.log(`[DataImportSection] Solicitando carga de datos para el año completo: ${year}`);
    onDataImported(year);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto de Ventas desde API</h2>
      </div>
      
      <p className="text-gray-600">
        Seleccione el año para el cual desea generar el plan de producción. La aplicación cargará automáticamente los datos de ventas para los 12 meses de ese año.
      </p>

      {/* --- Filtros --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end p-4 border rounded-lg bg-gray-50">
        <SelectField label="Año de Planificación" id="año" name="año" value={filters.año} onChange={handleFilterChange} options={filterOptions.años}/>
        
        <div className="lg:col-span-2">
            <button
                onClick={handleLoadFullYear}
                disabled={isLoading}
                className="w-full h-10 px-4 py-2 bg-green-600 text-white font-bold rounded-md shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                {isLoading ? 'Cargando datos del año...' : 'Cargar Datos del Año Completo'}
            </button>
        </div>
      </div>
    </div>
  );
};
