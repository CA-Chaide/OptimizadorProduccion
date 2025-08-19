// Importamos los tipos necesarios de Next.js.
import type { Metadata } from 'next';
// Importamos el componente Script para cargar librerías externas.
import Script from 'next/script';

// 1. Importamos el archivo de estilos globales.
import './globals.css';

// 2. Definimos los metadatos de la aplicación.
// Esto es bueno para el SEO y la información que se muestra en la pestaña del navegador.
export const metadata: Metadata = {
  title: 'Optimizador de Producción',
  description: 'Aplicación para optimizar la planificación de la producción.',
};

/**
 * Layout raíz que envuelve toda la aplicación.
 * Reemplaza al antiguo index.html. Define la estructura HTML base (<html>, <body>).
 * @param {React.ReactNode} children - Los componentes hijos que serán renderizados, en este caso, app/page.tsx.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {/* 3. Renderizamos el contenido de la página actual. */}
        {children}

        {/* 
          4. Importante: Script de la librería xlsx.
          Se carga de forma asíncrona usando el componente Script de Next.js.
          El atributo 'strategy="beforeInteractive"' asegura que esté disponible 
          antes de que el usuario interactúe con la página.
        */}
        <Script 
          src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
