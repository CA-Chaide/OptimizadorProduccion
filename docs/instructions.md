# INSTRUCCIONES PARA EL ASISTENTE DE IA

## 1. Stack Tecnológico
- **Framework:** Next.js (App Router), TypeScript, TailwindCSS, ShadCN UI.

## 2. Reglas de Negocio Maestras

### 2.1. Planificación Pull y Balanceo Dinámico
- **Origen:** Órdenes Previsionales de Forros.
- **Jerarquía de Ajuste de Capacidad:**
    1. **Versión de Fabricación:** Si hay sobrecarga, buscar versiones alternativas del material en otras máquinas compatibles antes de postergar.
    2. **Postergación:** Mover excedentes de Fecha 2 (Quito) al día posterior si el balanceo por versión no es suficiente.
- **Prioridad de Fecha:** GYE (Fecha 1) siempre tiene prioridad absoluta sobre Quito (Fecha 2).

### 2.2. Vínculo Técnico y Sincronización Estricta
- **Regla Espejo ACH-PEF:** El número de máquina `XX` de Acolchado (`HR-ACHXX`) y Tapas (`HR-PEFXX`) debe ser el mismo. Si una orden se mueve a `ACH09` por balanceo, su tapa debe ir a `PEF09`.
- **Especialización de Acolchado:** 
    - **ACH10, 06, 02:** Líneas Económica a Premium Estándar.
    - **ACH08, 09:** Líneas Superiores (Continental, etc.).
    - **ACH09 (Exclusivo):** Referencias Top (Grand Palace, Escape, Resiflex).

### 2.3. Flujos de Componentes
- **Bandas:** Inicio en `ACH11/12/BO01` (Metros) -> `RMTBx` (Unidades). Procesos extras `COS3D/ENCBD` en metros.
- **Interiores:** `INTPR/T` -> `INTPf`. Requiere bandas de `ACH11/12`.
- **Bases:** `MTBS1` (Tapa superior, requiere `ACH11/12`) y `MTBS` (Tapa cierre).
- **Corte de Telas:** Capacidad limitada a una sola jornada para todos los puestos `HR-CT`.
- **Telas y Fundas:** Capacidad de una sola persona. Flexibilidad `TTCF` -> `INTPf`.

### 2.4. Flexibilidad de Personal
- Se permite planificación de puestos al **50% de capacidad** para compartir un operario entre dos tareas.

## 3. Protocolo de Datos
- **Códigos de Material:** Normalizar eliminando ceros a la izquierda.
- **Versiones de Fabricación:** Usar la versión 1 por defecto; versiones superiores para balanceo de carga.
- **Visualización:** Tiempos y cantidades con **dos decimales**.

## 4. Estilo de Interacción
- Validar la sincronización de máquinas `XX` en cada movimiento de carga.
- Mantener la documentación actualizada con cada regla de balanceo aprendida.
