
import { NextResponse } from 'next/server';

export async function GET() {
  const API_URL = process.env.EXTERNAL_API_BASE_URL + '/presupuesto/';
  const API_TOKEN = process.env.EXTERNAL_API_TOKEN;

  if (!process.env.EXTERNAL_API_BASE_URL || !process.env.EXTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'API environment variables not configured on the server.' }, { status: 500 });
  }

  try {
    const response = await fetch(API_URL, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'accept': 'application/json',
      },
      cache: 'no-store', 
    });

    const contentType = response.headers.get('content-type');

    if (!contentType || !contentType.includes('application/json')) {
        const textError = await response.text();
        console.error(`External API returned non-JSON response (status ${response.status}): ${textError.substring(0, 500)}...`);
        return NextResponse.json({ error: `External API returned a non-JSON response type.`, details: `Received content-type: ${contentType}` }, { status: 502 });
    }

    const data = await response.json();
    
    if (!response.ok) {
      console.error(`External API error: ${response.status}`, data);
      return NextResponse.json({ error: `External API failed with status ${response.status}`, details: data }, { status: response.status });
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching from external API:', error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ error: 'Failed to parse JSON response from the external API.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Failed to connect to the external API.' }, { status: 502 });
  }
}
