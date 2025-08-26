
import type { ApiQuery, PresupuestoItem, TiempoEnsambleItem } from '@/types/types';

// --- Configuración Central de API ---
const API_BASE_URL = '/Aplicativos/ApiOptimizadorProduccion'; 
const API_TOKEN = 'SmGjjVAzURYKthfwGdY8riSK3U3mMCCBQBMiImGMRPuAo7BlUbwhyeemswWuP9k20gLVe3rPut4';

/**
 * Un 'fetcher' genérico y reutilizable para peticiones a la API.
 * Se encarga de hacer la petición fetch, añadir el token de autorización,
 * y parsear la respuesta como JSON. Puede manejar peticiones GET y POST.
 * @param url La URL a la que se hará la petición.
 * @param method El método HTTP (GET o POST).
 * @param body El cuerpo de la petición para POST.
 * @returns Los datos en formato JSON.
 * @throws Un error si la respuesta de la red no es 'ok'.
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

    const res = await fetch(url, options);

    if (!res.ok) {
        const error: any = new Error('Ocurrió un error al cargar los datos desde la API.');
        try {
            error.info = await res.json();
        } catch (e) {
            error.info = { message: `No se pudo leer el cuerpo del error. Estado: ${res.status}`, statusText: res.statusText };
        }
        error.status = res.status;
        throw error;
    }

    // Handle empty response for certain successful operations
    if (res.status === 204 || res.headers.get('content-length') === '0') {
        return null;
    }

    return res.json();
};

/**
 * Realiza una consulta genérica al nuevo motor de la API.
 * @param query El objeto de la consulta, que puede ser para documentación o datos.
 * @returns La respuesta de la API.
 */
export const queryApi = async (query: ApiQuery): Promise<any> => {
    let url = API_BASE_URL;
    let method: 'GET' | 'POST' = 'POST';
    let body: any = query;

    if (query.operation === 'get_documentation') {
        url += '/documentation/';
        method = 'GET';
        body = undefined; // No body for documentation GET request
    } else {
        url += '/query/';
    }

    return fetcher(url, method, body);
};

    