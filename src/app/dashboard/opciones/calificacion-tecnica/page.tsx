'use client';

import { PersonnelManagementSection } from '@/components';
import { useAppContext } from '@/context/AppProvider';

export default function CalificacionTecnicaPage() {
  const { employees, setEmployees, employeeSkills, setSkills, constraints } = useAppContext();
  return (
    <PersonnelManagementSection 
      employees={employees} 
      setEmployees={setEmployees} 
      skills={employeeSkills} 
      setSkills={setSkills} 
      constraints={constraints} 
    />
  );
}
