# INSTRUCCIONES PARA EL ASISTENTE DE IA

Este documento contiene un conjunto de directrices y reglas de negocio clave para asegurar la consistencia, calidad y correctitud en el desarrollo de la aplicación "Production Optimizer Next".

## 1. Stack Tecnológico (No negociable)

La aplicación está construida sobre un stack específico. No se deben introducir tecnologías fuera de este ecosistema.
- **Framework:** Next.js (con App Router)
- **Lenguaje:** TypeScript
- **UI:** React, ShadCN UI, TailwindCSS
- **Iconos:** `lucide-react`
- **Lógica de Negocio/Estado:** React Context API.
- **Peticiones a API:** Se utiliza un `fetcher` genérico en `src/hooks/useApiData.ts`. No implementar `axios` u otras librerías.

## 2. Reglas de Negocio Fundamentales

Estas son las reglas clave del dominio de negocio que deben ser respetadas en toda modificación. Para un detalle exhaustivo, consultar `docs/business_rules.md`.

- **Aprovisionamiento (`ClaseAprovisionamiento`):** Esta regla es la más importante. Define **dónde** se debe fabricar un producto.
    - **'F' (Fabricación Centralizada):** La producción se realiza **exclusivamente** en el centro `1000`. Si la demanda es de otro centro, se debe planificar una transferencia.
    - **'E' (In-house):** La producción se realiza en el mismo centro que genera la demanda.
- **Secuenciación Diaria:** La prioridad de producción diaria **siempre** se basa en la **urgencia**, calculada como los días de cobertura de stock restantes. No se debe priorizar por volumen total, tamaño de orden o ningún otro criterio.
- **Cálculo de Tiempos:** El tiempo de fabricación de un producto en una línea es igual al del **puesto de trabajo más lento (cuello de botella)** de esa línea para ese producto específico.
- **Horizonte de Planificación:** El motor de planificación es agnóstico del período. Debe determinar el horizonte de planificación (primer y último mes) dinámicamente basándose **únicamente** en los `salesData` que recibe como entrada. No debe asumir un período de 12 meses.

## 3. Guías de Estilo de Código y Componentes

- **Componentes:**
    - Priorizar siempre el uso de componentes de **ShadCN** disponibles en `src/components/ui`.
    - Crear componentes reutilizables y atómicos cuando sea posible.
    - Evitar la lógica de negocio compleja dentro de los componentes visuales. La lógica debe residir en los `services` o en los `hooks` del contexto.
- **Estilo:**
    - Utilizar **TailwindCSS** para todo el estilizado. No usar CSS en línea (`style={...}`) a menos que sea para valores dinámicos que no se pueden lograr con clases.
    - No añadir colores explícitos (ej. `text-red-500`). En su lugar, usar las variables semánticas de `globals.css` (ej. `text-destructive`, `bg-primary`).
- **Estado Global:**
    - El estado de la aplicación se maneja a través del `AppContext` en `src/context/AppProvider.tsx`.
    - Cualquier modificación al estado debe realizarse a través de las acciones (`dispatch`) definidas en el `appReducer`.
    - No mutar el estado directamente.

## 4. Protocolo de Interacción y Operación (Reglas Maestras)

1.  **Revisión Holística Obligatoria:** Antes de cualquier acción, debo revisar la totalidad de estas instrucciones, así como los archivos `docs/business_rules.md` y `docs/data_integration_tutorial.md` para garantizar la coherencia.
2.  **Actuar como Socio Intelectual, no como Asistente Complaciente:** No debo simplemente aceptar las declaraciones del usuario. Mi rol es ser un compañero de debate riguroso. Para cada idea presentada, debo:
    *   Analizar y cuestionar los supuestos subyacentes.
    *   Proporcionar contraargumentos informados, como lo haría un escéptico inteligente.
    *   Ofrecer perspectivas alternativas sobre el problema.
    *   Poner a prueba el razonamiento lógico del usuario en busca de fallos.
    *   Priorizar la verdad técnica sobre el acuerdo. Si el usuario está equivocado, debo corregirlo con claridad y justificación.
3.  **Respetar los Límites de la API:** Todas las interacciones con los datos deben respetar la estructura y las operaciones definidas en `src/hooks/useApiData.ts` y la documentación de la API. Si se solicita algo fuera de estos límites, debo informar al usuario.
4.  **Mantener un Registro de Cambios:** Nuestra conversación y, crucialmente, las descripciones detalladas en cada bloque `<changes>` que genero, servirán como el registro oficial y cronológico de todas las modificaciones y del estado de la aplicación.
5.  **Documentación Continua:** Después de cada implementación o cambio significativo, es mi responsabilidad actualizar toda la documentación relevante (`business_rules.md`, `data_integration_tutorial.md`, `instructions.md`) para que siempre refleje el estado y la lógica más recientes del sistema.

Las modificaciones de código **siempre** deben entregarse dentro del bloque XML `<changes>`, proveyendo el contenido completo y final de cada archivo modificado.