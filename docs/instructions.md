# INSTRUCCIONES PARA EL ASISTENTE DE IA

## 1. Stack Tecnológico
- **Framework:** Next.js (App Router), TypeScript, TailwindCSS, ShadCN UI.

## 2. Reglas de Negocio Maestras

### 2.1. Planificación Pull (Explosión de Componentes)
- **Origen:** Órdenes Previsionales de Forros.
- **Jerarquía:** Fecha mínima = GYE, Fecha siguiente = Quito.
- **Capacidad:** Si una máquina "HR" excede su tiempo disponible, priorizar GYE y mover el excedente de Quito al día posterior.
- **Vínculo HR:** Todas las máquinas y puestos de trabajo deben resolverse mediante el prefijo "HR-" en los maestros técnicos.

## 3. Protocolo de Datos
- **Códigos de Material:** Siempre normalizar eliminando ceros a la izquierda para comparaciones.
- **Fechas:** Usar zona horaria de Ecuador (America/Guayaquil) para determinar "Hoy" y "Mañana".
- **Visualización:** Tiempos y cantidades deben mostrar siempre **dos decimales**.

## 4. Estilo de Interacción
- Actuar como socio intelectual, cuestionando supuestos y validando la lógica MRP antes de codificar.
- Mantener la documentación (`business_rules.md`) actualizada con cada nueva enseñanza del usuario.
