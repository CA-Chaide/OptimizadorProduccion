'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { restriccionService } from '@/services/restriccion.service';
import type { FilterOptions } from '../importar-ventasV2/components/types';
import { getMesNumero } from '../importar-ventasV2/components/utils';
import { ImportarVentas5Section } from './components/ImportarVentas5Section';
import { RecursosDisponiblesSection, loadPuestosOverrides, type PuestosOverrides } from './components/RecursosDisponiblesSection';
import { InventarioObjetivoSection } from './components/InventarioObjetivoSection';
import { AjusteHorasSection } from './components/AjusteHorasSection';

/**
 * Pagina IV5 (Importar Ventas 5).
 *
 * Espejo simplificado de IV4: levanta opciones de filtros (anios, meses, centros)
 * y restricciones (NUMERO_MAXIMO_SABADOS, MAX_EXTRAS_HORAS, HORAS_TRABAJO,
 * HORAS_EXTRAS_FIN_SEMANA, DIAS_INV_OBJETIVO_*) y delega toda la logica a
 * `ImportarVentas5Section`. Aislada de IV3/IV4 (no comparte estado ni servicios
 * de escritura distintos a planGlobal/detalles, que se reusan tal cual).
 */
export default function ImportarVentasV5Page() {
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ años: [], meses: [], centros: [] });
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [numMaximoSabados, setNumMaximoSabados] = useState<number>(0);
  const [maxExtrasHoras, setMaxExtrasHoras] = useState<number>(0);
  const [horasTrabajo, setHorasTrabajo] = useState<number>(0);
  const [horasExtrasFin, setHorasExtrasFin] = useState<number>(0);
  // Factores de ajuste horas base -> netas (multiplicadores; 1 = sin ajuste),
  // POR CENTRO: { '1000': {normal,extra,sabado}, '2000': {...} }.
  const [factoresAjustePorCentro, setFactoresAjustePorCentro] =
    useState<Record<string, { normal: number; extra: number; sabado: number }>>({});
  const [restriccionesPIO, setRestriccionesPIO] = useState<any[]>([]);
  // Demanda efectiva publicada por IV5 (read-only) para derivar el catálogo de
  // etiquetas en la pestaña Inventario objetivo.
  const [demandDataIV5, setDemandDataIV5] = useState<any[]>([]);
  // Pestaña activa: 'recursos' | 'inventario' (nuevas) | 'iv5' (contenido actual).
  // Por defecto 'iv5' para no alterar el flujo actual; las pestañas nuevas quedan primero.
  const [tabActiva, setTabActiva] = useState<'recursos' | 'inventario' | 'horas' | 'iv5'>('iv5');

  // Overrides de puestos (de "Recursos disponibles"). Se reflejan a IV5 para
  // recalcular el cuello de botella vía n_puestos. La auto-recarga se dispara al
  // volver a la pestaña IV5 si los overrides cambiaron desde la última carga.
  const [puestosOverrides, setPuestosOverrides] = useState<PuestosOverrides>(() => loadPuestosOverrides());
  const [reloadSignal, setReloadSignal] = useState<number>(0);
  const overridesAplicadosRef = useRef<PuestosOverrides>(puestosOverrides);
  useEffect(() => {
    if (tabActiva === 'iv5' && puestosOverrides !== overridesAplicadosRef.current) {
      overridesAplicadosRef.current = puestosOverrides;
      setReloadSignal((s) => s + 1);
    }
  }, [tabActiva, puestosOverrides]);

  const loadRestrictions = useCallback(async () => {
    try {
      const restrictionsRes = await restriccionService.getAll();
      const rows = restrictionsRes.data ?? [];
      const restriccionSabados = rows.find((r: any) => r.nombre_restriccion === 'NUMERO_MAXIMO_SABADOS');
      const restriccionMaxExtras = rows.find((r: any) => r.nombre_restriccion === 'MAX_EXTRAS_HORAS');
      const restriccionHorasTrabajo = rows.find((r: any) => r.nombre_restriccion === 'HORAS_TRABAJO');
      const restriccionHorasExtrasFin = rows.find((r: any) => r.nombre_restriccion === 'HORAS_EXTRAS_FIN_SEMANA');

      if (restriccionSabados) setNumMaximoSabados(Number(restriccionSabados.valor_restriccion) || 0);
      if (restriccionMaxExtras) setMaxExtrasHoras(Number(restriccionMaxExtras.valor_restriccion) || 0);
      if (restriccionHorasTrabajo) setHorasTrabajo(Number(restriccionHorasTrabajo.valor_restriccion) || 8);
      if (restriccionHorasExtrasFin) setHorasExtrasFin(Number(restriccionHorasExtrasFin.valor_restriccion) || 0);

      // Factores de ajuste (porcentaje sobre horas base -> netas), POR CENTRO.
      // El valor en BD es el % (ej. -4.84); multiplicador = 1 + pct/100. Cada
      // factor tiene una fila por grupo; el centro sale de `grupo.centro`.
      const pctToMult = (pct: number): number => {
        if (!Number.isFinite(pct)) return 1;
        const mult = 1 + pct / 100;
        return mult >= 0 ? mult : 1;
      };
      const factorKey: Record<string, 'normal' | 'extra' | 'sabado'> = {
        FACTOR_AJUSTE_HORAS_NORMALES: 'normal',
        FACTOR_AJUSTE_HORAS_EXTRAS: 'extra',
        FACTOR_AJUSTE_SABADOS: 'sabado',
      };
      const porCentro: Record<string, { normal: number; extra: number; sabado: number }> = {};
      for (const r of rows) {
        const key = factorKey[String(r.nombre_restriccion)];
        if (!key) continue;
        const centro = String(r?.grupo?.centro ?? '').trim();
        if (!centro) continue;
        if (!porCentro[centro]) porCentro[centro] = { normal: 1, extra: 1, sabado: 1 };
        // Primera fila por (centro, factor) gana (valores uniformes entre grupos).
        porCentro[centro][key] = pctToMult(Number(r.valor_restriccion));
      }
      setFactoresAjustePorCentro(porCentro);

      const pio = rows.filter((r: any) =>
        String(r.nombre_restriccion ?? '').startsWith('DIAS_INV_OBJETIVO_') ||
        r.nombre_restriccion === 'TOP_N_INV_OBJETIVO',
      );
      setRestriccionesPIO(pio);
    } catch (error) {
      console.error('Error al cargar restricciones (IV5):', error);
    }
  }, []);

  useEffect(() => { loadRestrictions(); }, [loadRestrictions]);

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [yearsRes, mesesRes, centrosRes] = await Promise.all([
          serviciosService.getYears(),
          serviciosService.getMeses(),
          serviciosService.getCentros(),
        ]);

        setFilterOptions({
          años: (yearsRes.data || []).map((item: any) => ({
            value: String(item.Año || item.año || item),
            label: String(item.Año || item.año || item),
          })).sort((a: any, b: any) => Number(b.value) - Number(a.value)),
          meses: (mesesRes.data || []).map((item: any) => ({
            value: String(item.Mes || item.mes || item),
            label: String(item.Mes || item.mes || item),
          })),
          centros: (centrosRes.data || []).map((item: any) => ({
            value: item.Centro || item.centro || item,
            label: item.Centro || item.centro || item,
          })),
        });
      } catch (error) {
        console.error('Error al cargar opciones de filtros (IV5):', error);
      } finally {
        setIsLoadingOptions(false);
      }
    };
    loadFilterOptions();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-800">Plan de produccion - regresiva semanal y tope agregado</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Granularidad semanal, anticipos proporcionales, multilinea hibrido, mini-pasada PIO mensual y
            validacion de tope agregado de stock.
          </p>
        </div>
      </div>
      {/* Pestañas: Recursos disponibles (lógica nueva) | IV5 (contenido actual) */}
      <div className="px-6 pt-4">
        <div className="flex gap-1 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTabActiva('recursos')}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tabActiva === 'recursos'
                ? 'border-indigo-500 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Recursos disponibles
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('inventario')}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tabActiva === 'inventario'
                ? 'border-indigo-500 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Inventario objetivo
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('horas')}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tabActiva === 'horas'
                ? 'border-indigo-500 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Ajuste de horas
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('iv5')}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tabActiva === 'iv5'
                ? 'border-indigo-500 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Plan de produccion
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Ambas montadas; se ocultan con `hidden` para preservar el estado de IV5. */}
        <div hidden={tabActiva !== 'recursos'}>
          <RecursosDisponiblesSection
            filterOptions={filterOptions}
            isLoadingOptions={isLoadingOptions}
            numMaximoSabados={numMaximoSabados}
            maxExtrasHoras={maxExtrasHoras}
            horasTrabajo={horasTrabajo}
            horasExtrasFin={horasExtrasFin}
            getMesNumero={getMesNumero}
            onOverridesChange={setPuestosOverrides}
          />
        </div>
        <div hidden={tabActiva !== 'inventario'}>
          <InventarioObjetivoSection onSaved={loadRestrictions} demandData={demandDataIV5} />
        </div>
        <div hidden={tabActiva !== 'horas'}>
          <AjusteHorasSection
            horasTrabajo={horasTrabajo}
            maxExtrasHoras={maxExtrasHoras}
            horasExtrasFin={horasExtrasFin}
            onSaved={loadRestrictions}
          />
        </div>
        <div hidden={tabActiva !== 'iv5'}>
          <ImportarVentas5Section
            filterOptions={filterOptions}
            isLoadingOptions={isLoadingOptions}
            numMaximoSabados={numMaximoSabados}
            maxExtrasHoras={maxExtrasHoras}
            horasTrabajo={horasTrabajo}
            horasExtrasFin={horasExtrasFin}
            factoresAjustePorCentro={factoresAjustePorCentro}
            restriccionesPIO={restriccionesPIO}
            getMesNumero={getMesNumero}
            onEffectiveDataChange={setDemandDataIV5}
            puestosOverrides={puestosOverrides}
            reloadSignal={reloadSignal}
          />
        </div>
      </div>
    </div>
  );
}
