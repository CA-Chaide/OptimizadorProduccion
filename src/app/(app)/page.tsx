
'use client';

import React from 'react';
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
import { SidebarProvider, Sidebar, SidebarTrigger, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarInset, SidebarRail } from '@/components/ui/sidebar';
import { UserNav } from '@/components/user-nav';

// The main component that orchestrates the different sections
const ProductionOptimizerPage: React.FC = () => {
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
        <SidebarProvider>
            <Sidebar>
                <SidebarHeader>
                  <div className="flex items-center gap-2 p-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="h-6 w-6"><rect width="256" height="256" fill="none"></rect><line x1="208" y1="128" x2="128" y2="208" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"></line><line x1="192" y1="40" x2="40" y2="192" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"></line></svg>
                      <span className="text-lg font-semibold">ProdOpt</span>
                  </div>
                </SidebarHeader>
                <SidebarContent>
                    <SidebarMenu>
                        {Object.values(ActiveView).map(viewId => {
                            const config = viewConfig[viewId];
                            if (!config) return null;
                            return (
                                <SidebarMenuItem key={viewId}>
                                    <SidebarMenuButton
                                        onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: viewId })}
                                        isActive={activeView === viewId}
                                        tooltip={config.title}
                                    >
                                        {config.icon}
                                        <span>{config.title}</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            );
                        })}
                    </SidebarMenu>
                </SidebarContent>
                <SidebarFooter>
                    <UserNav />
                </SidebarFooter>
            </Sidebar>
             <SidebarInset>
                <div className="flex h-full flex-col bg-background">
                    <main className="flex-1 overflow-y-auto">
                        {renderActiveView()}
                    </main>
                </div>
            </SidebarInset>
            <Toaster />
        </SidebarProvider>
    );
};

export default ProductionOptimizerPage;
