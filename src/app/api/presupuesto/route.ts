
import { NextResponse } from 'next/server';

export async function GET() {
  const apiBaseUrl = 'https://intranet.chaide.com/Aplicativos/ApiOptimizadorProduccion';
  const apiToken = 'SmGjjVAzURYKthfwGdY8riSK3U3mMCCBQBMiImGMRPuAo7BlUbwhyeemswWuP9k20gLVe3rPut4';

  try {
    const response = await fetch(`${apiBaseUrl}/presupuesto/`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'accept': 'application/json',
      },
    });

    const contentType = response.headers.get('content-type');
    if (!response.ok || !contentType || !contentType.includes('application/json')) {
      const errorText = await response.text();
      console.error(`External API error (presupuesto): Status ${response.status}. Body: ${errorText}`);
      return NextResponse.json(
        { error: `La API externa devolvió un error o formato inesperado. Status: ${response.status}.` },
        { status: 502 } // Bad Gateway
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching from external API (presupuesto):', error);
    return NextResponse.json(
        { error: 'No se pudo conectar con la API externa de presupuesto.' }, 
        { status: 500 }
    );
  }
}
