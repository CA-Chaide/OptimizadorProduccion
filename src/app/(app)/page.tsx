
'use client';

import React from 'react';
import Image from 'next/image';
import {
  DataImportSection,
  ConstraintConfigurationSection,
  PersonnelManagementSection,
  MaintenanceSection,
  AbsenteeismSection,
  ProductionPlanSection,
  TacticalPlanSection,
  WorkShiftPlanningSection,
  RealDataSection,
  DashboardSection,
} from '@/components';
import { ActiveView, viewConfig } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';
import { Toaster } from "@/components/ui/toaster";
import { ClientProvider } from '@/context/ClientProvider';
import { MainNav } from '@/components/main-nav';


// The component that needs the context
const ProductionOptimizerClient: React.FC = () => {
    const {
        activeView,
        dispatch,
        handleDataImported,
        salesData,
        productionPlan,
        handleGeneratePlan,
        isLoading,
        constraints,
        setConstraints,
        employees,
        setEmployees,
        employeeSkills,
        setSkills,
        maintenanceEvents,
        setMaintenanceEvents,
        absenteeismEvents,
        setAbsenteeismEvents,
        workShifts,
        setWorkShifts,
        handleGenerateTacticalPlan,
        tacticalPlanResult,
        addNotification,
    } = useAppContext();

    const renderActiveView = () => {
        switch (activeView) {
            case ActiveView.DASHBOARD:
                return <DashboardSection plan={productionPlan.dailyPlan} salesData={salesData} constraints={constraints} />;
            case ActiveView.DATA_IMPORT:
                return <DataImportSection onDataImported={handleDataImported} />;
            case ActiveView.CONSTRAINTS:
                return <ConstraintConfigurationSection constraints={constraints} onConstraintsUpdate={setConstraints} salesDataProducts={salesData} addNotification={addNotification} />;
            case ActiveView.PERSONNEL:
                return <PersonnelManagementSection employees={employees} setEmployees={setEmployees} skills={employeeSkills} setSkills={setSkills} constraints={constraints} />;
            case ActiveView.MAINTENANCE:
                return <MaintenanceSection events={maintenanceEvents} setEvents={setMaintenanceEvents} constraints={constraints} onConstraintsUpdate={setConstraints} addNotification={addNotification} />;
            case ActiveView.ABSENTEEISM:
                return <AbsenteeismSection events={absenteeismEvents} setEvents={setAbsenteeismEvents} employees={employees} />;
            case ActiveView.PRODUCTION_PLAN:
                return <ProductionPlanSection plan={productionPlan} onGeneratePlan={handleGeneratePlan} isLoading={isLoading} constraints={constraints} />;
            case ActiveView.TACTICAL_SCHEDULING:
                return <TacticalPlanSection onGeneratePlan={handleGenerateTacticalPlan} />;
            case ActiveView.WORK_SHIFT_PLANNING:
                return <WorkShiftPlanningSection shifts={workShifts} setShifts={setWorkShifts} constraints={constraints} employees={employees} absenteeismEvents={absenteeismEvents} employeeSkills={employeeSkills} />;
            case ActiveView.DICTIONARY:
                return <RealDataSection />;
            default:
                return <DashboardSection plan={productionPlan.dailyPlan} salesData={salesData} constraints={constraints} />;
        }
    };

    return (
      <div className="flex h-screen bg-gray-100">
        {/* Sidebar */}
        <div className="hidden md:flex flex-col w-64 bg-primary text-primary-foreground">
            <div className="flex items-center justify-center h-20 bg-primary p-4">
                <Image src="/logo.png" alt="Chaide Logo" width={150} height={50} />
            </div>
            <div className="flex flex-col flex-1 overflow-y-auto">
                <nav className="flex-1 px-2 py-4 space-y-2">
                  <MainNav />
                </nav>
            </div>
        </div>

        {/* Main content */}
        <div className="flex flex-col flex-1 overflow-y-auto">
            <div className="p-4">
              {renderActiveView()}
            </div>
        </div>
        <Toaster />
    </div>
    );
};


// This is the default export for the page, which is a Server Component.
// It wraps the Client Component in the provider.
export default function ProductionOptimizerPage() {
    return (
        <ClientProvider>
            <ProductionOptimizerClient />
        </ClientProvider>
    );
}
