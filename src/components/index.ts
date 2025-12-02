/**
 * @file Archivo de barril para exportar todos los componentes de sección.
 * Esto permite importarlos desde una única ubicación.
 */

export * from './AbsenteeismSection';
export * from './ConstraintConfigurationSection';
export * from './DataImportSection';
export * from './DashboardSection';
export * from './MaintenanceSection';
export * from './PersonnelManagementSection';
export * from './ProductionPlanSection';
export * from './TacticalPlanSection';
export * from './WorkShiftPlanningSection';
export * from './RealDataSection';
export * from './InventorySummarySection';
export * from './RawStructureReportSection';

// Widgets y paneles
export { default as FloatingChatWidget } from './FloatingChatWidget';
export { default as FloatingLogsWidget } from './FloatingLogsWidget';
export { default as DebugPanel } from './DebugPanel';
