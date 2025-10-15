

import type { ApiQuery, PresupuestoItem, TiempoEnsambleItem } from '@/types/types';

// --- Configuración Central de API ---
const API_BASE_URL = ''; 
const API_TOKEN = 'SmGjjVAzURYKthfwGdY8riSK3U3mMCCBQBMiImGMRPuAo7BlUbwhyeemswWuP9k20gLVe3rPut4';

/**
 * Un 'fetcher' genérico y reutilizable para peticiones a la API.
 * Se encarga de hacer la petición fetch, añadir el token de autorización,
 * y parsear la respuesta como JSON. Puede manejar peticiones GET y POST.
 */
const fetcher = async (url: string, method: 'GET' | 'POST', body?: any) => {
    const options: RequestInit = {
        method,
        headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
    };

    // Para POST, solo añadir body si se proporciona explícitamente y no está vacío.
    // Esto es clave para la nueva prueba de query params.
    if (method === 'POST' && body && Object.keys(body).length > 0) {
        options.body = JSON.stringify(body);
    }

    try {
        const res = await fetch(url, options);

        if (!res.ok) {
            const errorText = await res.text();
            const error: any = new Error('Ocurrió un error al cargar los datos desde la API.');
            try {
                error.info = JSON.parse(errorText);
            } catch (e) {
                error.info = { message: `No se pudo leer el cuerpo del error. Estado: ${res.status}`, statusText: res.statusText, body: errorText };
            }
            error.status = res.status;
            throw error;
        }

        if (res.status === 204 || res.headers.get('content-length') === '0') {
            return null;
        }

        const jsonResponse = await res.json();
        return jsonResponse;

    } catch (error) {
        console.error('Fetcher: Capturado error de fetch', error);
        throw error;
    }
};

/**
 * Realiza una consulta genérica al nuevo motor de la API.
 * @param query El objeto de la consulta, que puede ser para documentación o datos.
 * @returns La respuesta de la API.
 */
export const queryApi = async (query: ApiQuery): Promise<any> => {
    let endpoint = '';
    let method: 'GET' | 'POST' = 'POST';
    let body: any = {};
    let urlParams = new URLSearchParams();

    if (query.operation === 'get_documentation') {
        endpoint = '/Aplicativos/ApiOptimizadorProduccion/documentation/';
        method = 'GET';
    } else {
        endpoint = '/Aplicativos/ApiOptimizadorProduccion/query/';
        
        // **NUEVA LÓGICA DE PRUEBA 2**
        // Construir query params si existen filtros
        if (query.filters) {
            for (const key in query.filters) {
                if (Object.prototype.hasOwnProperty.call(query.filters, key)) {
                    urlParams.append(key, String(query.filters[key]));
                }
            }
            // Dejamos el body vacío para esta prueba y enviamos solo 'source' y 'operation' en el cuerpo.
            body = { source: query.source, operation: query.operation, pagination: query.pagination };

        } else {
             body = query; // Comportamiento original si no hay filtros
        }
    }
    
    const queryString = urlParams.toString();
    const fullUrl = API_BASE_URL + endpoint + (queryString ? `?${queryString}` : '');

    console.log(`[useApiData] Querying API (Test 2): ${method} ${fullUrl}`, body ? JSON.stringify(body) : 'No Body');
    try {
        const response = await fetcher(fullUrl, method, body);
        return response;
    } catch(e) {
        console.error('[useApiData] API Fetch failed:', e);
        throw e;
    }
};
