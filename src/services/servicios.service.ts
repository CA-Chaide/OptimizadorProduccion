import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { environment } from "@/environments/environments.prod";

const API_URL = `${environment.apiURL}/api/servicios`;

export const serviciosService = {
  async getCuboHabilidadesOP(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/cuboHabilidadesOp", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Habilidades OP");
    }
    return response.json();
  },

  async getCuboInventarios(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/cuboInventarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Cubo Inventarios");
    }
    return response.json();
  },

  async getPresupuesto(page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/presupuestoV", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Presupuesto");
    }
    return response.json();
  },

  async getTiemposEnsamblado(
    page: number,
    rows: number,
  ): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/tiemposEnsamblado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Tiempos Ensamblado");
    }
    return response.json();
  },

  async getDiccionarioDeDatos(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/diccionarioDeDatos", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Diccionario de Datos");
    }
    return response.json();
  },

  async getDiccionarioDeFuentes(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/diccionarioDeFuentes", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Diccionario de Fuentes");
    }
    return response.json();
  },

  async getCentros(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/centros", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Centros");
    }
    return response.json();
  },

  async getMeses(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/meses", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Meses");
    }
    return response.json();
  },

  async getYears(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/years", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Years");
    }
    return response.json();
  },

  async getPresupuestoPorCentroAnio(anio: string, centro: string, meses: string, page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/presupuestoPorCentroAnio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anio: anio, centro: centro, meses: meses, page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Presupuesto por Centro");
    }
    return response.json();
  },

  async getPresupuestoPorMesesYAnio(anio: string, centro: string, meses: string, page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/presupuestoPorMesesYAnio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anio: anio, centro: centro, meses: meses, page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Presupuesto por Meses");
    }
    return response.json();
  },

  async getMaestroPorMesesYAnio(anio: string, centro: string, meses: string, page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/MaestroPorMesesYAnio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anio: anio, centro: centro, meses: meses, page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Maestro por Meses");
    }
    return response.json();
  },

  async getMaestroPorCentroYAnio(anio: string, centro: string, meses: string, page: number, rows: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/MaestroPorCentroYAnio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anio: anio, centro: centro, page: page, rowsPerPage: rows }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Maestro por Centro");
    }
    return response.json();
  },

  async getTiempoMaximoDeFabricacionMaterial(CodigoMaterial: string, CentroFabricacion: string, LineaFabricacion: string, Categoria: string, Necesidad: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/TiempoEstimadoFabricacionNecesidad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ CodigoMaterial: CodigoMaterial, CentroFabricacion: CentroFabricacion, LineaFabricacion: LineaFabricacion, Categoria: Categoria, Necesidad: Necesidad }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Tiempos de Fabricacion");
    }
    return response.json();
  },

  async getTiemposCanonPorPuestoDeTrabajo(dias_laborales: string, dias_sabados: string): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/TiemposCanonTrabajoPorEstacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dias_laborales: dias_laborales, dias_sabados: dias_sabados }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Tiempos Canon");
    }
    return response.json();
  },

  async getTiempoCanonicoEnFuncionDelCuelloCanonico(CodigoMaterial: string, CentroFabricacion: string, LineaFabricacion: string, Categoria: string, Necesidad: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/TiempoEstimadoFabricacionNecesidad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ CodigoMaterial: CodigoMaterial, CentroFabricacion: CentroFabricacion, LineaFabricacion: LineaFabricacion, Categoria: Categoria, Necesidad: Necesidad }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Tiempo Canonico");
    }
    return response.json();
  },

  async getHabilidadesOperadorPorEstacion(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/HabilidadesOperadorPorEstacion", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Habilidades Operador");
    }
    return response.json();
  },

  async getMaterialesBrutosPorMaterialMateriaPrima(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/MaterialesBrutosPorMaterialMateriaPrima", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: page, rowsPerPage: rowsPerPage }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Materiales Brutos");
    }
    return response.json();
  },

  async ListarMantenimientoPreventivosProgramados(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/ListarMantenimientosPreventivos", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Mantenimientos");
    }
    return response.json();
  },

  async OrdenesProvisionalesPaginados(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/OrdenesProvisionalesPaginadas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: page, rowsPerPage: rowsPerPage }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Ordenes Provisionales");
    }
    return response.json();
  },

  async VersionesFabricacion(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/VersionesFabricacionMateriales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: page, rowsPerPage: rowsPerPage }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Versiones Fabricacion");
    }
    return response.json();
  },

  async getOrdenesFert(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/OrdenesFertPaginadas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, rowsPerPage }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Error al obtener órdenes FERT");
    }
    return response.json();
  },

  async getTiemposEnsambladobyCentroyCodigoGrupo(centro: string, codigoGrupo: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/TiemposEnsambladoPorCentroYCodigoGrupo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Centro: centro, CodigoGrupo: codigoGrupo }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Tiempos Ensamblado");
    }
    return response.json();
  },

  async getMaestroMaterialesExplosion(centro: string, fert: string, page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/MaestroMaterialesExplosionPaginado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        Centro: centro,
        Fert: fert,
        page: page, 
        rowsPerPage: rowsPerPage,
      }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error de red al consultar el Maestro de Materiales." }));
      throw new Error(errorBody.message || "Error al consultar el Maestro de Materiales.");
    }
    return response.json();
  },

  async getTiempoAprovisionamientoMateriasPrimas(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/TiempoAprovisionamientoMateriasPrimas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: page, rowsPerPage: rowsPerPage }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Tiempos Aprovisionamiento");
    }
    return response.json();
  },

  async getPendientesTotales(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    try {
      const response = await fetch(API_URL + "/CuboPendientesTotales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          page:page,
          rowsPerPage: rowsPerPage
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: "Error de red al consultar la producción estimada." }));
        throw new Error(errorBody.message || "Error al consultar la producción estimada.");
      }
      return response.json();
    } catch (e) {
      throw e;
    }
  },

  async OrdenesProvisionalesAlphaPaginados(page: number, rowsPerPage: number): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/OrdenesProvisionalesAlphaPaginadas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: page, rowsPerPage: rowsPerPage }),
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch Ordenes Provisionales Alpha");
    }
    return response.json();
  },

  async getKPIMaestroForros(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + "/KPIMaestroForros", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Error al obtener KPI Maestro de Forros");
    }
    return response.json();
  },
};