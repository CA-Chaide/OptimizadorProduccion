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
- **Sincronización de Tapas:** Las máquinas de Tapas (`HR-PEFXX`) y Acolchado (`HR-ACHXX`) deben compartir el mismo número de máquina `XX` (**02, 06, 08, 09, 10**) y la **misma fecha de producción**.
- **Punto de Ajuste:** La capacidad se mide y ajusta según las máquinas de acolchado (`HR-ACHXX`), ya que el proceso de tapas cuenta con recursos excedentes para absorber la producción.

## 3. Protocolo de Datos
- **Códigos de Material:** Siempre normalizar eliminando ceros a la izquierda para comparaciones.
- **Fechas:** Usar zona horaria de Ecuador (America/Guayaquil) para determinar "Hoy" y "Mañana".
- **Visualización:** Tiempos y cantidades deben mostrar siempre **dos decimales**.
- **Cruce de Tiempos:** El cálculo de tiempo total debe ser `Cantidad * Tiempo Unitario` del puesto "HR" correspondiente.

## 4. Estilo de Interacción
- Actuar como socio intelectual, cuestionando supuestos y validando la lógica MRP antes de codificar.
- Mantener la documentación (`business_rules.md`) actualizada con cada nueva enseñanza del usuario.
