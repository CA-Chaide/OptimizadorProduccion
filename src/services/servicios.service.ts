import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { environment } from "@/environments/environments.prod";

// Utilizamos la ruta relativa que coincide con el proxy en next.config.ts para evitar errores de CORS
const API_URL = `/Aplicativos/ApiOptimizadorProduccion/api/servicios`;
const API_TOKEN = 'SmGjjVAzURYKthfwGdY8riSK3U3mMCCBQBMiImGMRPuAo7BlUbwhyeemswWuP9kf721d3d';

const getHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${API_TOKEN}`,
  "Accept": "application/json"
});

export const serviciosService = {
  async getCuboHabilidadesOP(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/cuboHabilidadesOp", {
      method: "GET",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Habilidades OP");
    }
    return response.json();
  },

  async getCuboInventarios(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/cuboInventarios", {
      method: "POST",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Cubo Inventarios");
    }
    return response.json();
  },

  async getPresupuesto(page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/presupuestoV", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Presupuesto");
    }
    return response.json();
  },

  async getTiemposEnsamblado(page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/tiemposEnsamblado", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Tiempos Ensamblado");
    }
    return response.json();
  },

  async getDiccionarioDeDatos(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/diccionarioDeDatos", {
      method: "GET",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Diccionario");
    }
    return response.json();
  },

  async getDiccionarioDeFuentes(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/diccionarioDeFuentes", {
      method: "GET",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Fuentes");
    }
    return response.json();
  },

  async getCentros(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/centros", {
      method: "GET",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Failed to fetch Centros" }));
      throw new Error(errorBody.message);
    }
    return response.json();
  },

  async getMeses(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/meses", {
      method: "GET",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Failed to fetch Meses" }));
      throw new Error(errorBody.message);
    }
    return response.json();
  },

  async getYears(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/years", {
      method: "GET",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Failed to fetch Years" }));
      throw new Error(errorBody.message);
    }
    return response.json();
  },

  async getPresupuestoPorCentroAnio(anio: string, centro: string, meses: string, page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/presupuestoPorCentroAnio", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ anio: anio, centro: centro, meses: meses, page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Presupuesto");
    }
    return response.json();
  },

  async getPresupuestoPorMesesYAnio(anio: string, centro: string, meses: string, page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/presupuestoPorMesesYAnio", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ anio: anio, centro: centro, meses: meses, page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Presupuesto");
    }
    return response.json();
  },

  async getMaestroPorMesesYAnio(anio: string, centro: string, meses: string, page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/MaestroPorMesesYAnio", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ anio: anio, centro: centro, meses: meses, page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Maestro");
    }
    return response.json();
  },

  async getMaestroPorCentroYAnio(anio: string, centro: string, meses: string, page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/MaestroPorCentroYAnio", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ anio: anio, centro: centro, page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Maestro");
    }
    return response.json();
  },

  async getTiempoMaximoDeFabricacionMaterial(CodigoMaterial: string, CentroFabricacion: string, LineaFabricacion: string, Categoria: string, Necesidad: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/TiempoEstimadoFabricacionNecesidad", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ CodigoMaterial: CodigoMaterial, CentroFabricacion: CentroFabricacion, LineaFabricacion: LineaFabricacion, Categoria: Categoria, Necesidad: Necesidad }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Tiempos");
    }
    return response.json();
  },

  async getTiemposCanonPorPuestoDeTrabajo(dias_laborales: string, dias_sabados: string): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/TiemposCanonTrabajoPorEstacion", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ dias_laborales: dias_laborales, dias_sabados: dias_sabados }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Tiempos Canon");
    }
    return response.json();
  },

  async getTiemposEnsambladobyCentroyCodigoGrupo(centro: string, codigoGrupo: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/TiemposEnsambladoPorCentroYCodigoGrupo", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ Centro: String(centro), CodigoGrupo: Number(codigoGrupo) }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Tiempos Ensamblado");
    }
    return response.json();
  },

  async getHabilidadesOperadorPorEstacion(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/HabilidadesOperadorPorEstacion", {
      method: "GET",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Habilidades");
    }
    return response.json();
  },

  async getMaterialesBrutosPorMaterialMateriaPrima(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/MaterialesBrutosPorMaterialMateriaPrima", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ page: page, rowsPerPage: rowsPerPage }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Materiales Brutos");
    }
    return response.json();
  },

  async ListarMantenimientoPreventivosProgramados(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/ListarMantenimientosPreventivos", {
      method: "GET",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Mantenimientos");
    }
    return response.json();
  },

  async OrdenesProvisionalesPaginados(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    try {
      const response = await fetch(API_URL + "/OrdenesProvisionalesPaginadas", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ page: page, rowsPerPage: rowsPerPage }),
      });
      if (!response.ok) {
        return { data: [], length: 0, totalRegistros: 0 };
      }
      return response.json();
    } catch (e) {
      return { data: [], length: 0, totalRegistros: 0 };
    }
  },

  async VersionesFabricacion(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/VersionesFabricacionMateriales", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ page: page, rowsPerPage: rowsPerPage }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Versiones");
    }
    return response.json();
  },

  async getOrdenesFert(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    try {
      const response = await fetch(API_URL + "/OrdenesFertPaginadas", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ page: page, rowsPerPage: rowsPerPage }),
      });
      if (!response.ok) {
        return { data: [], length: 0, totalRegistros: 0 };
      }
      return response.json();
    } catch (e) {
      return { data: [], length: 0, totalRegistros: 0 };
    }
  },

  async getMaestroMaterialesExplosion(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    try {
      const response = await fetch(API_URL + "/TiempoAprovisionamientoMateriasPrimas", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ 
          page: page, 
          rowsPerPage: rowsPerPage,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: "Error de red al consultar el Maestro de Materiales." }));
        throw new Error(errorBody.message || "Error al consultar el Maestro de Materiales.");
      }
      return response.json();
    } catch (e) {
      throw e;
    }
  },


  async getTiemposCuradoBloqueFormulado( page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    try {
      const response = await fetch(API_URL + "/tiemposCuradoBloqueFormulado", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ 
          page: page, 
          rowsPerPage: rowsPerPage,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: "Error de red al consultar el Maestro de Materiales." }));
        throw new Error(errorBody.message || "Error al consultar el Maestro de Materiales.");
      }
      return response.json();
    } catch (e) {
      throw e;
    }
  },
};
