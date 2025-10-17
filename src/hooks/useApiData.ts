

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

    if (method === 'POST' && body) {
        options.body = JSON.stringify(body);
    }
    
    console.log(`[Fetcher Log] ---> INICIANDO PETICIÓN...`);
    console.log(`[Fetcher Log] URL: ${url}`);
    console.log(`[Fetcher Log] Opciones:`, { method: options.method, headers: options.headers, body: body ? JSON.stringify(body) : 'No Body' });


    try {
        const res = await fetch(url, options);

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[Fetcher Log] ERROR en la respuesta. Estado: ${res.status} ${res.statusText}`);
            console.error(`[Fetcher Log] Cuerpo del error:`, errorText);
            const error: any = new Error('Ocurrió un error al cargar los datos desde la API.');
            try {
                error.info = JSON.parse(errorText);
            } catch (e) {
                error.info = { message: `No se pudo leer el cuerpo del error. Estado: ${res.status}`, statusText: res.statusText, body: errorText };
            }
            error.status = res.status;
            throw error;
        }
        
        console.log(`[Fetcher Log] Respuesta OK. Estado: ${res.status} ${res.statusText}`);

        if (res.status === 204 || res.headers.get('content-length') === '0') {
             console.log('[Fetcher Log] Respuesta vacía (204 No Content). Retornando null.');
            return null;
        }

        const jsonResponse = await res.json();
        console.log('[Fetcher Log] Respuesta JSON parseada:', jsonResponse);
        return jsonResponse;

    } catch (error) {
        console.error('[Fetcher Log] <--- PETICIÓN FALLIDA. Error de red o en fetch.', error);
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
    let body: any = query;

    if (query.operation === 'get_documentation') {
        endpoint = '/Aplicativos/ApiOptimizadorProduccion/documentation/';
        method = 'GET';
        body = undefined; // No body for documentation GET request
    } else {
        endpoint = '/Aplicativos/ApiOptimizadorProduccion/query/';
    }

    const fullUrl = API_BASE_URL + endpoint;
    console.log(`[useApiData] Preparando consulta para API: ${method} ${fullUrl}`, body ? JSON.stringify(body) : 'No Body');
    try {
        const response = await fetcher(fullUrl, method, body);
        return response;
    } catch(e) {
        // El error ya se loguea en el fetcher. Aquí solo lo relanzamos.
        throw e;
    }
};
