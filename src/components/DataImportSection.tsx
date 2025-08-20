
import React, { useState, useCallback, useContext } from 'react';
import { SalesDataRow, NotificationMessage } from '@/types/types';
import { parseExcelData } from '@/services/OptimizationService';
import { DataImportIcon, MAX_FILE_SIZE_MB } from '@/constants/constants';
import { NotificationContext } from '@/app/(app)/page';


interface DataImportSectionProps {
  onDataImported: (data: SalesDataRow[]) => void;
}

export const DataImportSection: React.FC<DataImportSectionProps> = ({ onDataImported }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [importedDataPreview, setImportedDataPreview] = useState<SalesDataRow[]>([]);
  const addNotification = useContext(NotificationContext);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Security: Validate file size before processing
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        addNotification('error', `El archivo es demasiado grande. El tamaño máximo permitido es ${MAX_FILE_SIZE_MB} MB.`);
        setFileName(null);
        event.target.value = '';
        return;
      }

      setFileName(file.name);
      setIsProcessing(true);
      addNotification('info', `Procesando archivo ${file.name}...`);
      try {
        const data = await parseExcelData(file);
        if (data.length === 0) {
          addNotification('warning', 'El archivo no contiene datos válidos o está vacío.');
          setImportedDataPreview([]);
        } else {
          setImportedDataPreview(data.slice(0, 10)); // Show preview of first 10 rows
          onDataImported(data); // Propagate all data
        }
      } catch (error) {
        console.error("Error parsing Excel file:", error);
        addNotification('error', `Error al procesar el archivo: ${(error as Error).message}`);
        setImportedDataPreview([]);
      } finally {
        setIsProcessing(false);
        // Reset file input to allow re-upload of the same file
        event.target.value = ''; 
      }
    }
  }, [onDataImported, addNotification]);

  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Importar Presupuesto de Ventas (Excel)</h2>
      </div>
      
      <p className="text-gray-600">
        Seleccione un archivo Excel (.xls o .xlsx) con la proyección de ventas.
        Asegúrese de que el archivo tenga una hoja llamada "PPTO_VTAS" (o que los datos estén en la primera hoja si "PPTO_VTAS" no existe) con las siguientes columnas:
        A: Año, B: Mes, C: Sector, D: Etiqueta, E: Código, F: Centro, 
        G: UnidadesProyectado, H: Familia.
      </p>

      <div className="mt-4">
        <label htmlFor="excel-upload" className="w-full sm:w-auto flex items-center justify-center px-6 py-3 border-2 border-dashed border-indigo-300 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors duration-200">
          <DataImportIcon />
          <span className="ml-2 text-indigo-600 font-medium">
            {fileName || "Seleccionar archivo Excel"}
          </span>
        </label>
        <input
          id="excel-upload"
          type="file"
          className="sr-only" 
          accept=".xlsx, .xls"
          onChange={handleFileChange}
          disabled={isProcessing}
        />
        {isProcessing && <p className="mt-2 text-sm text-indigo-600">Procesando...</p>}
      </div>

      {importedDataPreview.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-700 mb-2">Vista Previa de Datos Importados (primeras {importedDataPreview.length} filas):</h3>
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
