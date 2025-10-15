
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { TransferCalculatorIcon } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

const FilterInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ label, value, onChange, placeholder, className }) => (
  <div className={className}>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || `Buscar por ${label}...`}
      className="w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm h-10"
    />
  </div>
);

const SelectFilter: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}> = ({ label, value, onChange, options, className }) => (
  <div className={className}>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm h-10"
    >
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);


export const TransferCalculatorSection: React.FC = () => {
    const { addNotification, isLoading: isAppLoading } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [masterData, setMasterData] = useState<TiempoEnsambleItem[]>([]);
    
    const [filters, setFilters] = useState({
        material: '',
        centro: '',
        linea: '',
        puesto: '',
        claseAprovisionamiento: '',
    });

    const handleFilterChange = (name: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleLoadMasterData = async () => {
        setIsProcessing(true);
        setMasterData([]);
        
        try {
            addNotification('info', `Cargando todos los datos maestros de 'TiemposEnsamblado'...`);
            
            const assemblyData: TiempoEnsambleItem[] = await queryApi({ 
                source: 'TiemposEnsamblado', 
                operation: 'get_data',
                pagination: { limit: 200000 }
            });
            
            if (assemblyData.length > 0) {
                setMasterData(assemblyData.sort((a, b) => a.Material.localeCompare(b.Material)));
                addNotification('success', `Carga completada. Se encontraron ${assemblyData.length} registros maestros.`);
            } else {
                addNotification('warning', 'No se encontraron datos maestros en la fuente TiemposEnsamblado.');
            }

        } catch (error) {
            addNotification('error', `Error durante la carga de datos maestros: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
        }
    };
    
    const filteredData = useMemo(() => {
        return masterData.filter(item => {
            const f = filters;
            return (
                (f.material === '' || (item.Material && item.Material.toLowerCase().includes(f.material.toLowerCase())) || (item.CodMaterial && String(item.CodMaterial).includes(f.material))) &&
                (f.centro === '' || (item.Centro && String(item.Centro).toLowerCase().includes(f.centro.toLowerCase()))) &&
                (f.linea === '' || (item.Linea && item.Linea.toLowerCase().includes(f.linea.toLowerCase()))) &&
                (f.puesto === '' || (item.PuestoTrabajo && item.PuestoTrabajo.toLowerCase().includes(f.puesto.toLowerCase()))) &&
                (f.claseAprovisionamiento === '' || item.ClaseAprovisionamiento === f.claseAprovisionamiento)
            );
        });
    }, [masterData, filters]);


    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <TransferCalculatorIcon />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Datos Maestros (Tiempos de Ensamble)</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta carga todos los registros de la tabla `TiemposEnsamblado` para permitirle visualizar y filtrar los datos maestros. Use los filtros para analizar la configuración de sus productos, incluyendo la Clase de Aprovisionamiento.
            </p>

            <div className="p-4 border rounded-lg bg-gray-50">
                <button
                    onClick={handleLoadMasterData}
                    disabled={isProcessing || isAppLoading}
                    className="w-full md:w-1/3 h-12 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Cargando...' : 'Cargar Datos Maestros'}
                </button>
            </div>

            {masterData.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Datos Cargados ({filteredData.length} de {masterData.length} registros)</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-4 border rounded-lg bg-gray-50 items-end">
                    <FilterInput label="Material (Cód/Nombre)" value={filters.material} onChange={v => handleFilterChange('material', v)} />
                    <FilterInput label="Centro" value={filters.centro} onChange={v => handleFilterChange('centro', v)} />
                    <FilterInput label="Línea" value={filters.linea} onChange={v => handleFilterChange('linea', v)} />
                    <FilterInput label="Puesto de Trabajo" value={filters.puesto} onChange={v => handleFilterChange('puesto', v)} />
                    <SelectFilter
                        label="Clase Aprovisionamiento"
                        value={filters.claseAprovisionamiento}
                        onChange={v => handleFilterChange('claseAprovisionamiento', v)}
                        options={[
                            { value: '', label: 'Todas' },
                            { value: 'E', label: 'E (In-house)' },
                            { value: 'F', label: 'F (Centralizada)' },
                            { value: 'X', label: 'X (Flexible)' },
                        ]}
                    />
                </div>

                <div className="relative max-h-[70vh] overflow-y-auto border rounded-lg shadow-inner mt-4">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Cód. Material</th>
                                <th className="px-3 py-2 text-center font-semibold text-gray-600 uppercase tracking-wider">Clase Aprov.</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Línea</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Puesto Trabajo</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Tiempo (min)</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Seguridad</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredData.map((item, index) => (
                                <tr key={`${item.CodMaterial}-${item.Centro}-${item.Linea}-${item.PuestoTrabajo}-${index}`}>
                                    <td className="px-3 py-2 whitespace-normal font-medium text-gray-800">{item.Material}</td>
                                    <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-500">{normalizeMaterialCode(item.CodMaterial)}</td>
                                    <td className="px-3 py-2 text-center font-bold text-indigo-700">{item.ClaseAprovisionamiento || '-'}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.Centro}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.Linea}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.PuestoTrabajo}</td>
                                    <td className="px-3 py-2 text-right font-bold text-gray-900">{item.Tiempo?.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{item.StockSeguridad?.toLocaleString()}</td>
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
