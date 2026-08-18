'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { MainNav } from '@/components/main-nav';
import { Toaster } from "@/components/ui/toaster";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TacticalPlanMueblesSection, TacticalPlanPlanchasMixtasSection, TacticalPlanTallerCorteSection } from '@/components';

// Rutas de los tres "Proyectos" cuyo estado se debe conservar al navegar entre ellos (y hacia/desde
// cualquier otra página). Se mantienen SIEMPRE montados (solo ocultos con CSS) una vez visitados, en
// vez de dejar que Next.js los desmonte al cambiar de ruta — así no se pierde el progreso de la
// planificación en curso de ninguno de los tres al ir y volver.
const MUEBLES_PATH = '/dashboard/opciones/programacion-tactica-muebles';
const TALLER_CORTE_PATH = '/dashboard/opciones/programacion-tactica-taller-corte';
const PLANCHAS_MIXTAS_PATH = '/dashboard/opciones/programacion-tactica-planchas-mixtas';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const isMueblesActive = pathname === MUEBLES_PATH;
  const isTallerCorteActive = pathname === TALLER_CORTE_PATH;
  const isPlanchasMixtasActive = pathname === PLANCHAS_MIXTAS_PATH;

  // Una vez que el usuario visita cada Proyecto, se marca como "visitado" y a partir de ahí se
  // mantiene montado (oculto con CSS si no es el activo) para toda la sesión. Antes de la primera
  // visita no se monta, para no pagar el costo de descarga de datos de un Proyecto que nunca se abrió.
  const [visitedMuebles, setVisitedMuebles] = useState(isMueblesActive);
  const [visitedTallerCorte, setVisitedTallerCorte] = useState(isTallerCorteActive);
  const [visitedPlanchasMixtas, setVisitedPlanchasMixtas] = useState(isPlanchasMixtasActive);

  useEffect(() => {
    if (isMueblesActive) setVisitedMuebles(true);
    if (isTallerCorteActive) setVisitedTallerCorte(true);
    if (isPlanchasMixtasActive) setVisitedPlanchasMixtas(true);
  }, [isMueblesActive, isTallerCorteActive, isPlanchasMixtasActive]);

  const isPersistedProjectRoute = isMueblesActive || isTallerCorteActive || isPlanchasMixtasActive;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`hidden md:flex flex-col bg-primary text-primary-foreground transition-all duration-300 ease-in-out ${
        isSidebarCollapsed ? 'w-20' : 'w-64'
      }`}>
        <div className="flex items-center justify-center h-20 bg-primary px-4 pt-5 pb-3 relative">
          {!isSidebarCollapsed && (
            <Image src="/logo.png" alt="Chaide Logo" width={180} height={60} style={{width: 'auto', height: 'auto'}} />
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="flex items-center justify-center p-2 mx-2 mb-2 rounded-md hover:bg-white/20 transition-colors"
          title={isSidebarCollapsed ? 'Expandir' : 'Contraer'}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>

        <div className="flex flex-col flex-1 overflow-y-auto">
          <nav className="flex-1 px-2 py-4 space-y-2">
            <MainNav isCollapsed={isSidebarCollapsed} />
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        <div className="p-4">
          {visitedMuebles && (
            <div className={isMueblesActive ? '' : 'hidden'}>
              <div className="container mx-auto py-4">
                <TacticalPlanMueblesSection />
              </div>
            </div>
          )}
          {visitedTallerCorte && (
            <div className={isTallerCorteActive ? '' : 'hidden'}>
              <div className="container mx-auto py-4">
                <TacticalPlanTallerCorteSection />
              </div>
            </div>
          )}
          {visitedPlanchasMixtas && (
            <div className={isPlanchasMixtasActive ? '' : 'hidden'}>
              <div className="container mx-auto py-4">
                <TacticalPlanPlanchasMixtasSection />
              </div>
            </div>
          )}
          {!isPersistedProjectRoute && children}
        </div>
      </div>
      <Toaster />
    </div>
  );
}
