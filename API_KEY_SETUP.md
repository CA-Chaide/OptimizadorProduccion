# Configuración de API Key - Guía de Verificación

## Paso 1: Verificar el archivo .env.local

El archivo `.env.local` debe estar en la **raíz del proyecto** (mismo nivel que `package.json`) y debe contener EXACTAMENTE:

```
GOOGLE_GENAI_API_KEY=tu-api-key-aqui
```

**IMPORTANTE**: 
- NO debe haber espacios alrededor del `=`
- NO debe haber comillas alrededor de la API key
- El nombre DEBE ser exactamente `GOOGLE_GENAI_API_KEY` (no `GEMINI_API_KEY` ni `GOOGLE_API_KEY`)

## Paso 2: Reiniciar el servidor COMPLETAMENTE

1. En la terminal donde corre `npm run dev`, presiona `Ctrl+C`
2. Espera a que el proceso termine completamente
3. Ejecuta nuevamente: `npm run dev`
4. Espera a que diga "Ready in X seconds"

## Paso 3: Verificar que la variable se cargó

Abre la consola del navegador (F12) y verifica que NO aparezca el error:
```
FAILED_PRECONDITION: Please pass in the API key
```

## Paso 4: Probar el chat

1. Abre http://localhost:3000
2. Click en el widget azul
3. Envía un mensaje como "Hola"
4. Deberías ver una respuesta del AI, no "Sorry, I encountered an error"

## Si sigue fallando:

Verifica que tu `.env.local` tenga EXACTAMENTE este formato (reemplaza con tu API key real):

```
GOOGLE_GENAI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Sin espacios, sin comillas, sin líneas vacías antes.
