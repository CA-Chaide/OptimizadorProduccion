# Configuración de API Key - Guía de Verificación

## ✅ Configuración Automatizada

Ya he creado el archivo `.env.local` en la raíz del proyecto. Solo necesitas:

### Paso 1: Agregar tu API Key

1. Abre el archivo `.env.local` en la raíz del proyecto
2. Reemplaza `your-api-key-here` con tu API key real de Google AI
3. Guarda el archivo

El archivo debe verse así:
```
GOOGLE_GENAI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**IMPORTANTE**: 
- NO debe haber espacios alrededor del `=`
- NO debe haber comillas alrededor de la API key
- El nombre DEBE ser exactamente `GOOGLE_GENAI_API_KEY`

### Paso 2: Obtener tu API Key (si no la tienes)

1. Ve a [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Inicia sesión con tu cuenta de Google
3. Clic en "Create API Key"
4. Copia la API key generada

### Paso 3: Reiniciar el servidor COMPLETAMENTE

1. En la terminal donde corre `npm run dev`, presiona `Ctrl+C`
2. Espera a que el proceso termine completamente
3. Ejecuta nuevamente: `npm run dev`
4. Espera a que diga "Ready in X seconds"

### Paso 4: Verificar que funciona

1. Abre http://localhost:3000
2. Click en el widget de chat azul (esquina inferior derecha)
3. Envía un mensaje como "Hola"
4. Deberías ver una respuesta del AI

## 🐛 Solución de Problemas

### Error: "FAILED_PRECONDITION: Please pass in the API key"

**Causa**: La API key no se está cargando correctamente.

**Solución**:
1. Verifica que el archivo `.env.local` está en la raíz del proyecto (mismo nivel que `package.json`)
2. Verifica que no hay espacios ni comillas en la línea de la API key
3. Reinicia el servidor completamente (`Ctrl+C` y luego `npm run dev`)
4. Limpia la caché de Next.js: `rm -r .next` o `Remove-Item .next -Recurse` (PowerShell)

### Error: "API key invalid"

**Causa**: La API key no es válida o expiró.

**Solución**:
1. Ve a [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Genera una nueva API key
3. Reemplaza la key en `.env.local`
4. Reinicia el servidor

### El chat no responde

**Causa**: Problemas de red o límites de API.

**Solución**:
1. Abre la consola del navegador (F12) y busca errores
2. Verifica tu conexión a internet
3. Verifica que no hayas excedido el límite de solicitudes de Google AI

## 📝 Nota

El archivo `.env.local` ya ha sido agregado al `.gitignore` para que tu API key no se suba a GitHub.
