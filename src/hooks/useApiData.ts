
import useSWR from 'swr';
import type { PresupuestoItem, TiempoEnsambleItem } from '@/types/types';

// --- Configuración Central de API ---
const API_BASE_URL = 'https://intranet.chaide.com/Aplicativos/ApiOptimizadorProduccion';
const API_TOKEN = 'SmGjjVAzURYKthfwGdY8riSK3U3mMCCBQBMiImGMRPuAo7BlUbwhyeemswWuP9k20gLVe3rPut4';

/**
 * Un 'fetcher' genérico y reutilizable para SWR.
 * Se encarga de hacer la petición fetch, añadir el token de autorización,
 * y parsear la respuesta como JSON.
 * @param url La URL a la que se hará la petición.
 * @returns Los datos en formato JSON.
 * @throws Un error si la respuesta de la red no es 'ok'.
 */
const fetcher = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Accept': 'application/json',
    },
  });

  // Si el servidor responde con un código de error (ej. 401, 404, 500),
  // SWR lo capturará como un error.
  if (!res.ok) {
    const error: any = new Error('Ocurrió un error al cargar los datos.');
    // Adjuntamos información extra al objeto de error.
    try {
        error.info = await res.json();
    } catch (e) {
        error.info = { message: 'No se pudo leer el cuerpo del error.', statusText: res.statusText };
    }
    error.status = res.status;
    throw error;
  }

  return res.json();
};

// --- Hooks Específicos por Endpoint ---

/**
 * Hook para obtener los datos de la API de Presupuesto.
 * Utiliza SWR para cacheo, revalidación y deduplicación automáticas.
 * Pide solo el primer registro para el diccionario de datos.
 */
export function usePresupuestoData() {
  const { data, error, isLoading } = useSWR<PresupuestoItem[], Error>(
    `${API_BASE_URL}/presupuesto/?skip=0&limit=1`,
    fetcher
  );

  return {
    data,
    error,
    isLoading,
  };
}

/**
 * Hook para obtener los datos de la API de Tiempos de Ensamble.
 * Utiliza SWR para cacheo, revalidación y deduplicación automáticas.
 * Pide solo el primer registro para el diccionario de datos.
 */
export function useTiempoEnsambleData() {
  const { data, error, isLoading } = useSWR<TiempoEnsambleItem[], Error>(
    `${API_BASE_URL}/tiempoensamble/?skip=0&limit=1`,
    fetcher
  );

  return {
    data,
    error,
    isLoading,
  };
}
