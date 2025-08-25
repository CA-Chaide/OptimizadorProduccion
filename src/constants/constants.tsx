
import React from 'react';
import { 
    LayoutDashboard,
    Upload,
    SlidersHorizontal,
    Wrench,
    Users,
    CalendarX2,
    ListChecks,
    CalendarClock,
    Plus,
    Pencil,
    Trash2,
    CalendarCheck,
    DatabaseZap,
} from 'lucide-react';
import { ProcessType, Holiday } from './types'; 

export const APP_TITLE = "Optimizador de Producción";

export enum ActiveView {
  DASHBOARD = 'DASHBOARD',
  DATA_IMPORT = 'DATA_IMPORT',
  CONSTRAINTS = 'CONSTRAINTS',
  PRODUCTION_PLAN = 'MEDIUM_TERM_PLAN',
  PERSONNEL = 'PERSONNEL_MANAGEMENT',
  MAINTENANCE = 'MAINTENANCE',
  ABSENTEEISM = 'ABSENTEEISM_MANAGEMENT',
  TACTICAL_SCHEDULING = 'TACTICAL_SCHEDULING',
  WORK_SHIFT_PLANNING = 'WORK_SHIFT_PLANNING',
  REAL_DATA = 'REAL_DATA',
}

// SVG Icons are now imported from lucide-react for consistency
export const DashboardIcon = () => <LayoutDashboard className="w-5 h-5" />;
export const DataImportIcon = () => <Upload className="w-5 h-5" />;
export const ConstraintsIcon = () => <SlidersHorizontal className="w-5 h-5" />;
export const MaintenanceIcon = () => <Wrench className="w-5 h-5" />;
export const PersonnelIcon = () => <Users className="w-5 h-5" />;
export const AbsenteeismIcon = () => <CalendarX2 className="w-5 h-5" />;
export const PlanIcon = () => <ListChecks className="w-5 h-5" />;
export const TacticalSchedulingIcon = () => <CalendarClock className="w-5 h-5" />;
export const WorkShiftIcon = () => <CalendarCheck className="w-5 h-5" />;
export const RealDataIcon = () => <DatabaseZap className="w-5 h-5" />;


// Common action icons
export const PlusIcon = () => <Plus className="w-4 h-4 mr-1" />;
export const EditIcon = () => <Pencil className="w-4 h-4" />;
export const DeleteIcon = () => <Trash2 className="w-4 h-4" />;


export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export const PROCESS_TYPE_OPTIONS: Array<{ value: ProcessType, label: string }> = [
    { value: 'Colchones', label: 'Colchones' },
    { value: 'Forros', label: 'Forros' },
    { value: 'Bases', label: 'Bases' },
    { value: 'Paneles', label: 'Paneles' },
    { value: 'Espuma', label: 'Espuma' },
    { value: 'Muebles', label: 'Muebles' },
];

export const HOLIDAY_APPLIES_TO_OPTIONS: Array<{ value: Holiday['appliesTo'], label: string }> = [
    { value: 'Produccion', label: 'Producción' },
    { value: 'Distribucion', label: 'Distribución' },
    { value: 'Ambos', label: 'Ambos' },
];

export const MAX_FILE_SIZE_MB = 10;
export const APP_VERSION = '1.0.0-next';

const NAVIGATION_ITEMS = [
  { id: ActiveView.DASHBOARD, label: 'Dashboard', icon: <DashboardIcon /> },
  { id: ActiveView.DATA_IMPORT, label: 'Importar Ventas', icon: <DataImportIcon /> },
  { id: ActiveView.CONSTRAINTS, label: 'Definir Restricciones', icon: <ConstraintsIcon /> },
  { id: ActiveView.PERSONNEL, label: 'Calificación Técnica', icon: <PersonnelIcon /> },
  { id: ActiveView.MAINTENANCE, label: 'Mantenimiento', icon: <MaintenanceIcon /> },
  { id: ActiveView.ABSENTEEISM, label: 'Gestión Ausentismos', icon: <AbsenteeismIcon /> },
  { id: ActiveView.PRODUCTION_PLAN, label: 'Plan de Producción', icon: <PlanIcon /> },
  { id: ActiveView.TACTICAL_SCHEDULING, label: 'Programación Táctica', icon: <TacticalSchedulingIcon /> },
  { id: ActiveView.WORK_SHIFT_PLANNING, label: 'Planificación de Turnos', icon: <WorkShiftIcon /> },
  { id: ActiveView.REAL_DATA, label: 'Diccionario de Datos', icon: <RealDataIcon /> },
];


export const viewConfig: Record<ActiveView, { title: string; icon: JSX.Element }> = 
  Object.fromEntries(NAVIGATION_ITEMS.map(item => [item.id, { title: item.label, icon: item.icon }])) as Record<ActiveView, { title: string; icon: JSX.Element }>;
