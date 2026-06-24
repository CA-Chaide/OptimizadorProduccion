
export const environment = {
    production: true,
    nombreAplicacion: "APP_MARCACIONES_WEB",
    
    // Se cambian las URLs absolutas por rutas relativas que coinciden con los rewrites de next.config.ts
    // Esto soluciona los errores de CORS al usar el servidor de Next.js como proxy.
    apiURL : 'https://apps.chaide.com/ProductionOptimizer/api',
    apiURLSeguridades : '/seguridades',

    tituloSistema: 'SISTEMA INTEGRADO DE Optimalidad Operativa',
};
