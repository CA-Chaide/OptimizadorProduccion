'use client';

import React, { useCallback } from 'react';
import type { SalesDataRow } from '@/types/types';
import { parseExcelFile } from '@/services/OptimizationService';

/**
 * Propiedades para el componente DataImportSection.
 */
interface DataImportSectionProps {
  // Callback para pasar los datos cargados al componente padre (app/page.tsx).
  onDataLoaded: (data: SalesDataRow[]) => void;
}

/**
 * Componente para la importación de datos desde archivos Excel.
 * Es un Componente de Cliente porque interactúa con el sistema de archivos del usuario.
 */
export function DataImportSection({ onDataLoaded }: DataImportSectionProps) {
  
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // Usamos la lógica de parseo del servicio.
        const data = await parseExcelFile(file);
        // Notificamos al componente padre.
        onDataLoaded(data);
        alert('Archivo cargado y procesado correctamente.');
      } catch (error) {
        console.error("Error al procesar el archivo:", error);
        alert('Hubo un error al procesar el archivo.');
      }
    }
  }, [onDataLoaded]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Importación de Datos</h2>
      <p className="mb-4">Selecciona un archivo Excel (.xlsx) para cargar los datos de ventas.</p>
      <input 
        type="file" 
        accept=".xlsx" 
        onChange={handleFileChange} 
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
      />
    </div>
  );
}
