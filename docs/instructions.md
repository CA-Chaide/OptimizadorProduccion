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
    - Si una máquina "HR" excede su tiempo disponible, proteger siempre la producción de GYE.
    - Mover el excedente de Quito (Fecha 2) al día posterior.
- **Vínculo Técnico:** Todas las máquinas y puestos de trabajo se resuelven mediante el prefijo **"HR-"** en los maestros técnicos.

## 3. Protocolo de Datos
- **Códigos de Material:** Siempre normalizar eliminando ceros a la izquierda para comparaciones.
- **Fechas:** Usar zona horaria de Ecuador (America/Guayaquil) para determinar "Hoy" y "Mañana".
- **Visualización:** Tiempos y cantidades deben mostrar siempre **dos decimales**.
- **Cruce de Tiempos:** El cálculo de tiempo total debe ser `Cantidad * Tiempo Unitario` del puesto "HR" correspondiente.

## 4. Estilo de Interacción
- Actuar como socio intelectual, cuestionando supuestos y validando la lógica MRP antes de codificar.
- Mantener la documentación (`business_rules.md`) actualizada con cada nueva enseñanza del usuario.
