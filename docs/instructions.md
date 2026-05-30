# INSTRUCCIONES PARA EL ASISTENTE DE IA

## 1. Stack Tecnológico
- **Framework:** Next.js (App Router), TypeScript, TailwindCSS, ShadCN UI.

## 2. Reglas de Negocio Maestras

### 2.1. Planificación Pull (Explosión de Componentes)
- **Origen:** Órdenes Previsionales de Forros.
- **Jerarquía de Fechas:** 
    - Fecha mínima = Producción para **GYE** (Prioridad Máxima).
    - Fecha siguiente = Producción para **Quito** (Prioridad Secundaria).
- **Gestión de Capacidad:** 
    - Si una máquina "HR" se satura, proteger siempre la producción de GYE.
    - Mover el excedente de Quito (Fecha 2) al día posterior.

### 2.2. Vínculo Técnico y Sincronización
- **Prefijo HR:** Todas las máquinas se resuelven mediante el prefijo **"HR-"**.
- **Sincronización de Tapas:** Las máquinas de Tapas (`HR-PEFXX`) y Acolchado (`HR-ACHXX`) deben compartir el mismo número de máquina `XX` (**02, 06, 08, 09, 10**) y la **misma fecha de producción**. La capacidad la dictan las acolchadoras.
- **Sincronización de Bandas:** 
    - El flujo inicia en `HR-ACH11`/`12` (o `HR-BO01`) produciendo en **metros por lotes**. 
    - El rematado (**HR-RMTBx**) y el proceso final (**HR-RMTBm**) se calculan en **unidades**.
    - Los procesos adicionales de cocido (**HR-COS3D**) y encintado (**HR-ENCBD**) se calculan en **metros**.
- **Proceso de Interiores:** Flujo iniciado en `HR-INTPR` o `HR-INTPT` (según referencia) y consolidado en el puesto final **HR-INTPf**. Requiere vinculación con acolchado de banda en `HR-ACH11`/`12`.
- **Proceso de Bases (HR-FBASE):** 
    - **Tapa Superior (HR-MTBS1):** Requiere vinculación con demanda de acolchado en **HR-ACH11/12**.
    - **Tapa con Cierre (HR-MTBS):** Genera demanda de telas.
- **Corte de Telas:** Puestos `HR-CTBAN`, `HR-CTBSC`, `HR-CTCHN`, `HR-CTINT`. La capacidad total de estos puestos se limita a **una sola jornada**. Atiende interiores, bases y forros de tela.
- **Telas y Fundas (TTCF / TTSUP):**
    - Capacidad ajustada para **una sola persona**.
    - Flexibilidad: `HR-TTCF` puede ser absorbido por `HR-INTPf` si hay saturación en `HR-TTSUP`.
- **Cobertura de Inventario:** La producción de componentes de banda debe satisfacer la demanda de forros y reponer el **Stock de Seguridad**.
- **Punto de Ajuste:** La capacidad se mide y ajusta según las máquinas críticas de acolchado, ya que los procesos de confección suelen tener recursos excedentes.

## 3. Protocolo de Datos
- **Códigos de Material:** Siempre normalizar eliminando ceros a la izquierda para comparaciones.
- **Fechas:** Usar zona horaria de Ecuador (America/Guayaquil) para determinar "Hoy" y "Mañana".
- **Visualización:** Tiempos y cantidades deben mostrar siempre **dos decimales**.
- **Cruce de Tiempos:** El cálculo de tiempo total debe ser `Cantidad * Tiempo Unitario` del puesto "HR" correspondiente.

## 4. Estilo de Interacción
- Actuar como socio intelectual, cuestionando supuestos y validando la lógica MRP antes de codificar.
- Mantener la documentación (`business_rules.md`) actualizada con cada nueva enseñanza del usuario.
