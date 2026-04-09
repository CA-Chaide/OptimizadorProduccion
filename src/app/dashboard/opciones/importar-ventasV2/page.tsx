
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { restriccionService } from '@/services/restriccion.service';
import { bottleneckAnalysisService } from '@/services/BottleneckAnalysisService';
import { logger } from '@/services/LogService';

import {
  MONTH_NUMBERS,
  getMesNumero,
  getMesNombre,
  calculateWorkDays,
  MultiSelectDropdown,
  TimesCanonSection,
  RawBackendDataTable,
  BottleneckAnalysisSection,
  BottleneckIdentificationSection,
  BottleneckAnalysisSectionCentro1000,
  BottleneckMaterialAnalysisSection,
  BottleneckMonthlySummaryC2000Section,
  BottleneckMonthlySummaryC1000Section,
  BacklogProgressiveSection,
  TiempoCanonResult,
  TransferNeed,
  ViableTransfer,
  FilterOptions,
  SelectedFilters,
  RawBackendDataTableHandle,
  normalizeMaterialCode
} from './components';

export default function ImportarVentasPage() {
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    años: [],
    meses: [],
    centros: []
  });

  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>({
    año: '',
    meses: [],
    centros: []
  });

  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [activeTab, setActiveTab] = useState(1);
  const [bottleneckData, setBottleneckData] = useState<any[]>([]);
  const [numMaximoSabados, setNumMaximoSabados] = useState<number>(0);
  const [maxExtrasHoras, setMaxExtrasHoras] = useState<number>(0);
  const [horasTrabajo, setHorasTrabajo] = useState<number>(0);
  const [horasExtrasFin, setHorasExtrasFin] = useState<number>(0);
  
  // ESTADOS DE RESULTADOS CALCULADOS (Cerebro Central)
  const [computedResultsC2000, setComputedResultsC2000] = useState<any[]>([]);
  const [computedResultsC1000, setComputedResultsC1000] = useState<any[]>([]);
  
  const [trasladosDesdeCentro2000, setTrasladosDesdeCentro2000] = useState<TransferNeed[]>([]);
  const [trasladosViablesHaciaC2000, setTrasladosViablesHaciaC2000] = useState<ViableTransfer[]>([]);

  const [tiemposCanonResults, setTiemposCanonResults] = useState<TiempoCanonResult[]>([]);
  const [isLoadingTimesCanon, setIsLoadingTimesCanon] = useState(false);

  // Cargar restricciones
  useEffect(() => {
    const loadRestrictions = async () => {
      try {
        const restrictionsRes = await restriccionService.getAll();
        
        if (restrictionsRes.data && restrictionsRes.data.length > 0) {
          const restriccionSabados = restrictionsRes.data.find((r: any) => r.nombre_restriccion === 'NUMERO_MAXIMO_SABADOS');
          const restriccionMaxExtras = restrictionsRes.data.find((r: any) => r.nombre_restriccion === 'MAX_EXTRAS_HORAS');
          const restriccionHorasTrabajo = restrictionsRes.data.find((r: any) => r.nombre_restriccion === 'HORAS_TRABAJO');
          const restriccionHorasExtrasFin = restrictionsRes.data.find((r: any) => r.nombre_restriccion === 'HORAS_EXTRAS_FIN_SEMANA');
          
          if (restriccionSabados) setNumMaximoSabados(Number(restriccionSabados.valor_restriccion) || 0);
          if (restriccionMaxExtras) setMaxExtrasHoras(Number(restriccionMaxExtras.valor_restriccion) || 0);
          if (restriccionHorasTrabajo) setHorasTrabajo(Number(restriccionHorasTrabajo.valor_restriccion) || 8);
          if (restriccionHorasExtrasFin) setHorasExtrasFin(Number(restriccionHorasExtrasFin.valor_restriccion) || 0);
        }
      } catch (error) {
        console.error('Error al cargar restricciones:', error);
      }
    };
    
    loadRestrictions();
  }, []);

  // Cargar opciones de filtros
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [yearsRes, mesesRes, centrosRes] = await Promise.all([
          serviciosService.getYears(),
          serviciosService.getMeses(),
          serviciosService.getCentros()
        ]);

        setFilterOptions({
          años: (yearsRes.data || []).map((item: any) => ({ 
            value: String(item.Año || item.año || item), 
            label: String(item.Año || item.año || item) 
          })).sort((a: any, b: any) => Number(b.value) - Number(a.value)),
          
          meses: (mesesRes.data || []).map((item: any) => ({ 
            value: String(item.Mes || item.mes || item), 
            label: String(item.Mes || item.mes || item) 
          })),
          
          centros: (centrosRes.data || []).map((item: any) => ({ 
            value: item.Centro || item.centro || item, 
            label: item.Centro || item.centro || item 
          }))
        });

        const firstYear = (yearsRes.data || [])[0];
        if (firstYear) {
          setSelectedFilters(prev => ({
            ...prev,
            año: String(firstYear.Año || firstYear.año || firstYear)
          }));
        }
      } catch (error) {
        console.error('Error al cargar opciones de filtros:', error);
      } finally {
        setIsLoadingOptions(false);
      }
    };

    loadFilterOptions();
  }, []);

  const tableRef = useRef<RawBackendDataTableHandle>(null);

  const loadTimesCanon = useCallback(async (año: string, meses: string[]) => {
    if (!año || !meses || meses.length === 0) return;

    setIsLoadingTimesCanon(true);
    setTiemposCanonResults([]);
    const newResults: TiempoCanonResult[] = [];
    const yearNum = parseInt(año);
    
    for (const mesInput of meses) {
      const mesNum = getMesNumero(mesInput);
      if (!mesNum) continue;

      const mesNombre = getMesNombre(mesNum);

      try {
        const workDays = await calculateWorkDays(yearNum, mesNum);
        const diasSabadosDisponibles = Math.max(0, workDays.diasSabados - numMaximoSabados);

        const response = await serviciosService.getTiemposCanonPorPuestoDeTrabajo(
          String(workDays.diasLaborables),
          String(diasSabadosDisponibles)
        );

        newResults.push({
          mes: mesNombre,
          mesNumero: mesNum,
          diasLaborables: workDays.diasLaborables,
          diasSabados: diasSabadosDisponibles,
          diasFeriados: workDays.diasFeriados,
          data: response.data || [],
          error: null
        });
      } catch (err) {
        newResults.push({
          mes: mesNombre,
          mesNumero: mesNum,
          diasLaborables: 0,
          diasSabados: 0,
          diasFeriados: [],
          data: [],
          error: (err as Error).message
        });
      }
    }

    setTiemposCanonResults(newResults);
    setIsLoadingTimesCanon(false);
  }, [numMaximoSabados]);

  // Limpiar cache del servicio cuando cambien datos críticos
  useEffect(() => {
    bottleneckAnalysisService.clearCache();
    setComputedResultsC2000([]);
    setComputedResultsC1000([]);
    setTrasladosViablesHaciaC2000([]);
  }, [bottleneckData, tiemposCanonResults]);

  const handleLoadData = async () => {
    if (!selectedFilters.año || selectedFilters.meses.length === 0) {
      alert('Por favor selecciona año y meses');
      return;
    }

    const promises: Promise<any>[] = [
      loadTimesCanon(selectedFilters.año, selectedFilters.meses)
    ];
    
    if (selectedFilters.centros.length > 0) {
      promises.push(tableRef.current?.loadData() ?? Promise.resolve());
    }
    
    await Promise.all(promises);
  };

  // HANDLERS PARA CAPTURAR RESULTADOS (ORQUESTADOR)
  const handleResultsC2000Ready = useCallback((results: any[]) => {
    setComputedResultsC2000(results);
  }, []);

  const handleResultsC1000Ready = useCallback((results: any[]) => {
    setComputedResultsC1000(results);
    
    // CAPTURAR TRASLADOS REALES (VIABLES) PARA GUAYAQUIL
    const viableTransfers = results
      .filter(row => (row._envioC2000 || 0) > 0)
      .map(row => ({
        CodMaterial: normalizeMaterialCode(row.CodMaterial),
        mes: String(row.mesRef || row.Mes || ''),
        cantidad: Number(row._envioC2000)
      }));
    
    if (viableTransfers.length >= 0) {
      setTrasladosViablesHaciaC2000(viableTransfers);
    }
  }, []);

  const tabs = [
    { id: 1, label: 'Tiempos Canónicos', color: 'blue' },
    { id: 2, label: 'Datos Backend (Ventas)', color: 'blue' },
    { id: 3, label: 'Identificación de Cuellos de Botella', color: 'red' },
    { id: 4, label: 'Análisis Centro 2000', color: 'blue' },
    { id: 5, label: 'Análisis Centro 1000', color: 'teal' },
    { id: 8, label: 'Resumen Mensual C1000', color: 'teal' },
    { id: 7, label: 'Resumen Mensual C2000', color: 'indigo' },
    { id: 9, label: 'Backlog Progresivo C1000', color: 'teal' },
    { id: 10, label: 'Backlog Progresivo C2000', color: 'indigo' },
    { id: 6, label: 'Bottleneck por Material', color: 'indigo' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header con filtros */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-800 mb-4">Importar Ventas V2 - Optimizador de Producción</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Año de Planificación</label>
              <select
                value={selectedFilters.año}
                onChange={(e) => setSelectedFilters(prev => ({ ...prev, año: e.target.value }))}
                disabled={isLoadingOptions}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccionar año...</option>
                {filterOptions.años.map(year => (
                  <option key={year.value} value={year.value}>{year.label}</option>
                ))}
              </select>
            </div>

            <div>
              <MultiSelectDropdown
                label="Meses de Horizonte"
                options={filterOptions.meses}
                selected={selectedFilters.meses}
                onChange={(meses) => setSelectedFilters(prev => ({ ...prev, meses }))}
                disabled={isLoadingOptions}
              />
            </div>

            <div>
              <MultiSelectDropdown
                label="Centros de Demanda"
                options={filterOptions.centros}
                selected={selectedFilters.centros}
                onChange={(centros) => setSelectedFilters(prev => ({ ...prev, centros }))}
                disabled={isLoadingOptions}
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={handleLoadData}
                disabled={isLoadingOptions}
                className="w-full inline-flex items-center justify-center bg-blue-600 text-white rounded-md px-4 py-2.5 font-medium text-sm transition-colors hover:bg-blue-700 disabled:bg-gray-400"
              >
                Cargar Datos y Calcular Tiempos
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 overflow-x-auto">
          <nav className="flex space-x-1 whitespace-nowrap" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? `bg-${tab.color}-50 text-${tab.color}-700 border-b-2 border-${tab.color}-600`
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        <div style={{ display: activeTab === 1 ? 'block' : 'none' }}>
          <TimesCanonSection
            results={tiemposCanonResults}
            isLoading={isLoadingTimesCanon}
            numMaximoSabados={numMaximoSabados}
            maxExtrasHoras={maxExtrasHoras}
            horasTrabajo={horasTrabajo}
            horasExtrasFin={horasExtrasFin}
          />
        </div>

        <div style={{ display: activeTab === 2 ? 'block' : 'none' }}>
          <RawBackendDataTable 
            ref={tableRef}
            año={selectedFilters.año}
            meses={selectedFilters.meses}
            centros={selectedFilters.centros}
            onDataLoaded={setBottleneckData}
          />
        </div>

        <div style={{ display: activeTab === 3 ? 'block' : 'none' }}>
          <BottleneckIdentificationSection 
            data={bottleneckData} 
            tiemposCanon={tiemposCanonResults}
          />
        </div>

        <div style={{ display: activeTab === 4 ? 'block' : 'none' }}>
          <BottleneckAnalysisSection 
            data={bottleneckData} 
            tiemposCanon={tiemposCanonResults}
            numMaximoSabados={numMaximoSabados}
            maxExtrasHoras={maxExtrasHoras}
            horasTrabajo={horasTrabajo}
            horasExtrasFin={horasExtrasFin}
            onTransferNeedsConsolidatedChanged={setTrasladosDesdeCentro2000}
            onComputedDataReady={handleResultsC2000Ready}
            trasladosViables={trasladosViablesHaciaC2000}
          />
        </div>

        <div style={{ display: activeTab === 5 ? 'block' : 'none' }}>
          <BottleneckAnalysisSectionCentro1000 
            data={bottleneckData} 
            tiemposCanon={tiemposCanonResults}
            numMaximoSabados={numMaximoSabados}
            maxExtrasHoras={maxExtrasHoras}
            horasTrabajo={horasTrabajo}
            horasExtrasFin={horasExtrasFin}
            trasladosDesdeCentro2000={trasladosDesdeCentro2000}
            onComputedDataReady={handleResultsC1000Ready}
          />
        </div>

        <div style={{ display: activeTab === 8 ? 'block' : 'none' }}>
          <BottleneckMonthlySummaryC1000Section 
            data={computedResultsC1000} 
            tiemposCanon={tiemposCanonResults}
            numMaximoSabados={numMaximoSabados}
            maxExtrasHoras={maxExtrasHoras}
            horasTrabajo={horasTrabajo}
            horasExtrasFin={horasExtrasFin}
            trasladosDesdeCentro2000={trasladosDesdeCentro2000}
          />
        </div>

        <div style={{ display: activeTab === 7 ? 'block' : 'none' }}>
          <BottleneckMonthlySummaryC2000Section 
            data={computedResultsC2000} 
            tiemposCanon={tiemposCanonResults}
            numMaximoSabados={numMaximoSabados}
            maxExtrasHoras={maxExtrasHoras}
            horasTrabajo={horasTrabajo}
            horasExtrasFin={horasExtrasFin}
            trasladosViables={trasladosViablesHaciaC2000}
          />
        </div>

        <div style={{ display: activeTab === 9 ? 'block' : 'none' }}>
          <BacklogProgressiveSection 
            data={computedResultsC1000}
            tiemposCanon={tiemposCanonResults}
            centro="1000"
            titulo="Backlog Progresivo Centro 1000"
            numMaximoSabados={numMaximoSabados}
            maxExtrasHoras={maxExtrasHoras}
            horasExtrasFin={horasExtrasFin}
          />
        </div>

        <div style={{ display: activeTab === 10 ? 'block' : 'none' }}>
          <BacklogProgressiveSection 
            data={computedResultsC2000}
            tiemposCanon={tiemposCanonResults}
            centro="2000"
            titulo="Backlog Progresivo Centro 2000"
            numMaximoSabados={numMaximoSabados}
            maxExtrasHoras={maxExtrasHoras}
            horasExtrasFin={horasExtrasFin}
            trasladosViables={trasladosViablesHaciaC2000}
          />
        </div>

        <div style={{ display: activeTab === 6 ? 'block' : 'none' }}>
          <BottleneckMaterialAnalysisSection 
            data={bottleneckData}
            isLoading={isLoadingTimesCanon}
          />
        </div>
      </div>
    </div>
  );
}
