/**
 * @file Archivo centralizado para todas las definiciones de tipos e interfaces de TypeScript.
 * No cambia su propósito respecto a la aplicación original.
 * Será importado por la mayoría de archivos .tsx y .ts que manejen datos.
 */

// Ejemplo: Tipo para una fila de datos de ventas extraída del Excel.
export interface SalesDataRow {
  'Product ID': string;
  'Product Name': string;
  'Sales Volume': number;
  'Date': string;
  [key: string]: any; // Permite otras columnas no definidas explícitamente.
}

// Ejemplo: Tipo para las restricciones de la aplicación.
export interface AppConstraints {
  maxShiftHours: number;
  minProductionSpeed: number;
  maxOvertime: number;
}

// Ejemplo: Tipo para un ítem en el plan de producción generado.
export interface ProductionPlanItem {
  id: string;
  taskName: string;
  quantity: number;
  startDate: string;
  endDate: string;
  assignedTo: string;
}

// Ejemplo: Tipo para un registro de ausentismo.
export interface AbsenteeismRecord {
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: 'sick' | 'vacation' | 'personal';
}

// Ejemplo: Tipo para un miembro del personal.
export interface Personnel {
  id: string;
  name: string;
  role: string;
  skills: string[];
}
