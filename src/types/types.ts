







export type SyncStatus = {
    isSynced: boolean;
    lastSyncTimestamp: string | null;
    errors: string[];
}


// Este AppState ya no será necesario, se moverá al hook useAppState
export type AppState = {
  year: number | null;
  activeView: ActiveView;
  salesData: SalesDataRow[];
  isLoading: boolean;
  productionPlan: ProductionPlan;
  detailedProductionPlan: DetailedProductionPlan | null; // New
  constraints: AppConstraints;
  employees: Employee[];
  employeeSkills: EmployeeSkill[];
  maintenanceEvents: MaintenanceEvent[];
  absenteeismEvents: AbsenteeismEvent[];
  workShifts: WorkShift[];
  tacticalPlanResult: TacticalPlanResult | null;
  syncStatus: SyncStatus | null;
};

// Tipos de acción para el reducer
export type AppAction =
  | { type: 'SET_YEAR'; payload: number }
  | { type: 'SET_ACTIVE_VIEW'; payload: ActiveView }
  | { type: 'SET_SALES_DATA'; payload: SalesDataRow[] }
  | { type: 'GENERATE_PRODUCTION_PLAN_START' }
  | { type: 'GENERATE_PRODUCTION_PLAN_SUCCESS'; payload: DetailedProductionPlan } // Modified
  | { type: 'GENERATE_PRODUCTION_PLAN_ERROR'; payload?: string } // Allow error message
  | { type: 'SET_CONSTRAINTS'; payload: AppConstraints }
  | { type: 'SET_EMPLOYEES'; payload: Employee[] }
  | { type: 'SET_EMPLOYEE_SKILLS'; payload: EmployeeSkill[] }
  | { type: 'SET_MAINTENANCE_EVENTS'; payload: MaintenanceEvent[] }
  | { type: 'SET_ABSENTEEISM_EVENTS'; payload: AbsenteeismEvent[] }
  | { type: 'SET_WORK_SHIFTS'; payload: WorkShift[] }
  | { type: 'GENERATE_TACTICAL_PLAN'; payload: TacticalPlanResult | null }
  | { type: 'SET_SYNC_STATUS'; payload: SyncStatus };

export type AbsenteeismEvent = {
  id: string;
  reason: 'Vacaciones' | 'Cita Médica' | 'Capacitaciones';
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endDate: string;   // YYYY-MM-DD
  endTime: string;   // HH:MM
  employeeIds: string[]; // Can contain one or more employee IDs
  notes?: string;
};

export type MaintenanceEvent = {
  id: string;
  title: string;
  processType: ProcessType; 
  workstationDefinitionId: string; 
  productionLineId?: string; // Optional: May not be tied to a single line
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endDate: string;   // YYYY-MM-DD
  endTime: string;   // HH:MM
};

export type Employee = {
  id: string;
  name: string;
  employeeCode: string;
  isActive?: boolean;
};

// Represents the qualification of an employee for a specific role at a specific center.
export interface Qualification {
  centerId: string;
  role: 'Operador' | 'Ayudante';
  skillLevel: number; // 0-100
}

// A skill is defined for a specific machine and contains multiple qualifications.
export interface EmployeeSkill {
  employeeId: string;
  machineCode: string; // Links to Machine.code from catalog
  workstationDefinitionId?: string; //DEPRECATED, USE machineCode
  skillLevel?: number; // DEPRECATED, USE qualifications
  qualifications: Qualification[];
}


export type ProcessType = 'Colchones' | 'Forros' | 'Bases' | 'Paneles' | 'Espuma' | 'Muebles';

export interface SalesDataRow {
  id: string; // Unique ID for the row, can be generated on import
  año: number;
  mes: number;
  sector: string; // Describes the market or customer segment
  etiqueta: string; // Additional categorization for sales data
  código: string; // Product code
  centro: string; // Work center name where DEMAND originates (from import)
  unidadesProyectado: number;
  dolaresProyectado: number;
  descripciónMaterial: string; // Used for material requirements planning
  familia: string;
  marca: string;
  lineaProduccion: string; // Suggested production line name (from import, map to ID)
}

// New: Global definition for a type of workstation
export interface WorkstationDefinition {
  id:string;
  name: string; // Unique name for the workstation type, e.g., "Cerrador"
  employeesPerWorkstation: number; // How many employees operate ONE such workstation
  machineCode: string | null; // New: Unique code for the machine associated with this workstation
  isActive?: boolean;
}

export interface ProductProcessInfo {
  id: string; // Unique ID for this process info
  productId: string; // Links to SalesDataRow.código
  productName?: string; // For easier display
  productionLineId: string; // The line where this process happens
  workstationTimes: Array<{ workstationDefinitionId: string; timeHours: number }>; // Time in hours per unit, links to WorkstationDefinition
  totalManufacturingTimeHours: number; // Sum of workstationTimes per unit
  aprovisionamientoEspecial?: 'E' | 'X' | 'F'; // E=Mismo centro, X=Aprovisionable 1000/2000, F=Solo traslado
}

export interface ProductionLine {
  id: string;
  name: string;
  workCenterId: string; // The WorkCenter this line belongs to
  processType: ProcessType; // Type of process this line is for
  assignedWorkstations: Array<{ // New: Replaces inline workstations
    definitionId: string; // ID of the WorkstationDefinition
    quantity: number;     // How many of this type of workstation are on this line
  }>;
  capacity: { // General capacity, more specific calculation will use workstation times
    maxUnitsPerHour: number;
    normalUnitsPerHour: number;
    minUnitsPerHour: number;
  };
  materialsHandled: string[];
  isActive?: boolean;
}

export interface WorkCenter {
  id: string;
  name: string; // e.g., "1000", "2000"
  productionLineIds: string[];
  isActive?: boolean;
}

// New structure for Labor Cost Settings
export interface LaborCostSettings {
  factorAdicionalDiurno: number; // Percentage, e.g., 50 for 50% extra on base for these hours
  factorRecargoNocturno: number; // Percentage, e.g., 25 for 25% extra on night hours
  factorFinSemanaFeriado: number; // Percentage, e.g., 100 for 100% extra on base for weekend/holiday hours
}

export interface ShiftParameters {
  regularHoursPerDay: number;
  extraHoursPerDay: number;
  saturdayAndHolidayHours: number;
}


export interface InventorySetting {
  id: string;
  itemId: string; // Product code (código)
  itemName: string;
  centerId: string; // WorkCenter ID where this inventory is located
  isRawMaterial: boolean; // Not used in current logic, but kept for future
  minStock: number;
  maxStock: number;
  currentStock: number; // Initial stock level at the beginning of planning
}

export interface Bottleneck { // Kept for future, not used in current optimization
  id: string;
  description: string;
  location: string;
  estimatedImpactHours: number;
  isActive?: boolean;
}

export interface SupplierDeliveryTime { // Kept for future
  id: string;
  materialId: string;
  materialName: string;
  supplierName: string;
  leadTimeDays: number;
  isActive?: boolean;
}

export interface QualityParameter { // Kept for future
  id: string;
  name: string;
  description: string;
  impactOnTimePercent?: number;
  impactOnCostPercent?: number;
  isActive?: boolean;
}

export interface SupplyInfo {
  código: string;
  centro: string;
  aprovisionamiento: 'E' | 'X' | 'F';
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  appliesTo: 'Produccion' | 'Distribucion' | 'Ambos';
  isProductionAllowed: boolean; // New: To allow production on certain holidays
}

export interface ProductionPlanItem {
  id: string;
  productId: string;
  productName: string;
  year: number;
  month: number;
  week: number;
  day: number; // New: Specific day of the month
  quantityToProduce: number;
  demandOnDay: number; // New: To show daily sales demand
  initialStockOnDay: number; // New: Stock at the beginning of the day
  finalStockOnDay: number; // New: Stock at the end of the day
  assignedLineId?: string; 
  producingCenterId?: string; 
  shiftId?: string; 
  estimatedLaborCost: number;
  hoursWorked: number; // Renamed from estimatedManufacturingTimeHours for clarity
  status: 'Planificado' | 'En Progreso' | 'Completado' | 'Retrasado' | 'Factibilidad Baja' | 'Error en Datos' | 'Transferencia';
  notes?: string;
  isTransfer?: boolean;
  transferDestinationCenterId?: string; 
  transferSourceCenterId?: string; 
}

export interface MonthlyProductionPlanItem {
    id: string; // YYYY-MM-ProductId-CenterId
    year: number;
    month: number;
    productId: string;
    productName: string;
    producingCenterId?: string;
    totalQuantityToProduce: number;
    totalHoursWorked: number;
    totalEstimatedLaborCost: number;
}

export interface ProductionPlan {
    dailyPlan: ProductionPlanItem[];
    monthlyPlan: MonthlyProductionPlanItem[];
    auditLog: string[];
}

// --- New Types for Step-by-Step Debugging ---
export interface PlanningGroupMonthlyDetail {
  pairKey: string;
  productId: string;
  centerName: string;
  year: number;
  month: number;
  demand: number;
  initialStock: number;
  minStock: number;
}

// Changed to represent a single monthly need, not an array
export interface MonthlyNeed {
  pairKey: string;
  productId: string;
  centerName: string;
  year: number;
  month: number;
  productionNeeded: number;
}

export interface MonthlyAssignment {
  id: string; 
  monthIndex: number;
  lineId: string;
  lineName: string;
  productId: string;
  centerName: string;
  units: number;
  originalNeedUnits: number;
  advancedUnits: number;
  totalHours: number;
  laborCost: number;
}

export interface DetailedProductionPlan {
  finalPlan: ProductionPlan;
  planningGroupDetails: PlanningGroupMonthlyDetail[];
  productionNeeds: MonthlyNeed[];
  monthlyAssignments: MonthlyAssignment[];
}
// --- End New Types ---


// New: Type for the summary sheet in Excel export
export interface LineMonthlySummary {
  lineId: string;
  lineName: string;
  centerName: string;
  year: number;
  month: string;
  initialStock: number;
  minStock: number;
  demand: number;
  production: number;
  finalStock: number;
  workingDays: number;
  avgWeekdayHours: number;
  saturdaysWorked: number;
  avgSaturdayHours: number;
  holidaysWorked: number;
  holidayHours: number;
}


export interface AppConstraints {
  workstationDefinitions: WorkstationDefinition[]; // New: Global workstation definitions
  workCenters: WorkCenter[];
  productionLines: ProductionLine[];
  productProcessInfos: ProductProcessInfo[];
  globalBaseCostPerHour: number | null; 
  laborCostFactors: LaborCostSettings | null; 
  shiftParameters: ShiftParameters;
  inventorySettings: InventorySetting[];
  bottlenecks: Bottleneck[];
  contingencyFundPercentage: number;
  supplierDeliveryTimes: SupplierDeliveryTime[];
  qualityParameters: QualityParameter[];
  holidays: Holiday[];
}

export interface NotificationMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  text: string;
  errors?: string[]; // Optional: For displaying a list of detailed error messages
}

export interface ChartDataItem {
  name: string;
  value?: number;
  [key: string]: any;
}

export interface MonthlyInventoryState {
  [centerId: string]: {
    [productId: string]: {
      initialStock: number;
      produced: number;
      receivedViaTransfer: number;
      salesDemandFulfilled: number;
      transferredOut: number;
      finalStock: number;
    };
  };
}

export interface ShiftProportions {
  daytimeProportion: number;
  nighttimeProportion: number;
}

// --- Tactical Scheduling Types ---
export interface ProvisionalOrder {
    rowIndex: number;
    ORDENPREVISIONAL: string;
    MATERIAL: string;
    NOMBRE: string;
    CANTIDAD: number;
    FECHAINICIO: string; // YYYY-MM-DD
    CENTRO: string;
}

export interface TacticalRequest {
    executionDate: string; // YYYY-MM-DD
    targetDate: string; // YYYY-MM-DD
    provisionalOrders: ProvisionalOrder[];
}

export interface AssignedPersonnel {
    workstationDefinitionId: string;
    workstationName: string;
    required: number;
    available: (Employee & { skillLevel?: number })[];
}

export interface TacticalOrderItem {
    id: string;
    productId: string;
    productName: string;
    centerName: string;
    quantity: number;
    assignedLineName: string;
    requiredHours: number;
    assignedPersonnel: AssignedPersonnel[];
}

export interface TacticalPlanResult {
    plan: TacticalOrderItem[];
    alerts: string[];
}


// --- Work Shift Planning ---
export interface WorkShift {
  id: string; // e.g., '2023-11-20-lineId1-wsId2-day'
  date: string; // YYYY-MM-DD
  lineId: string;
  workstationDefId: string;
  shiftType: 'day' | 'night';
  employeeIds: string[]; // Can contain multiple employees
}

// --- Machine Catalog ---
export interface Machine {
    code: string;
    name: string;
    processType: ProcessType;
}

// --- API Data Types ---
export type ApiQuery = 
  | {
      operation: 'get_documentation';
    }
  | {
      operation: 'get_data';
      source: string;
      filters?: { [key: string]: any };
      pagination?: { skip?: number; limit?: number };
    }
  | {
      operation: 'get_distinct_values';
      source: string;
      column: string;
    };
    
export interface PresupuestoItem {
  Año: number;
  Mes: number;
  Sector: string;
  Etiqueta: string;
  Centro: string;
  CodVendedor: string;
  CodMaterial: string;
  UnidadesProyectado: number;
  DolaresProyectado: number;
  Vendedor: string;
  Material: string;
  Familia: string;
  Marca: string;
}

export interface TiempoEnsambleItem {
  CodMaterial: string;
  Centro: string;
  Linea: string;
  PuestoTrabajo: string;
  Tiempo: number;
  SaldoInicial: number;
  StockSeguridad: number;
  StockMaximo: number;
  GrupoCompras: string;
  TipoAprovisionamiento: 'E' | 'X' | 'F' | null;
}




// Import ActiveView from constants
import { ActiveView } from '@/constants/constants';
