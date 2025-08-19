/**
 * @file Contiene la lógica de negocio pesada y no visual.
 * Funciones como el parseo de archivos y algoritmos de optimización.
 * En Next.js, estas funciones pueden ser ejecutadas en el servidor
 * a través de Server Actions o API Routes para mejorar el rendimiento.
 */

// 1. Importaciones de tipos de datos.
import type { SalesDataRow, AppConstraints, ProductionPlanItem } from '@/types/types';

// Declaramos 'XLSX' en el ámbito global para que TypeScript no se queje,
// ya que la librería se carga a través de un <script> en app/layout.tsx.
declare const XLSX: any;

/**
 * Parsea un archivo Excel y lo convierte en un array de objetos JSON.
 * @param {File} file - El archivo .xlsx a procesar.
 * @returns {Promise<SalesDataRow[]>} - Una promesa que resuelve a un array con los datos de ventas.
 */
export const parseExcelFile = (file: File): Promise<SalesDataRow[]> => {
  return new Promise((resolve, reject) => {
    // Verificamos que la librería XLSX esté disponible en el objeto window.
    if (typeof XLSX === 'undefined') {
      return reject(new Error('La librería de parseo (XLSX) no está cargada.'));
    }

    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: SalesDataRow[] = XLSX.utils.sheet_to_json(worksheet);
        resolve(json);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };

    reader.readAsBinaryString(file);
  });
};

/**
 * Algoritmo (simplificado) para generar el plan de producción.
 * @param {SalesDataRow[]} salesData - Datos de ventas.
 * @param {AppConstraints} constraints - Restricciones de la aplicación.
 * @returns {ProductionPlanItem[]} - El plan de producción generado.
 */
export const generateProductionPlan = (salesData: SalesDataRow[], constraints: AppConstraints): ProductionPlanItem[] => {
  // Lógica de ejemplo:
  // Aquí iría el algoritmo complejo de optimización.
  // Por ahora, solo mapeamos los datos de ventas a un plan simple.
  console.log('Generando plan con restricciones:', constraints);

  return salesData.map((sale, index) => ({
    id: `task-${index + 1}`,
    taskName: `Producir ${sale['Product Name']}`,
    quantity: sale['Sales Volume'],
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 86400000).toISOString(), // +1 día
    assignedTo: 'Equipo A',
  }));
};
