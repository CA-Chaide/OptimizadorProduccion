
import { NextResponse } from 'next/server';

export async function GET() {
  const API_URL = process.env.EXTERNAL_API_BASE_URL + '/presupuesto/';
  const API_TOKEN = process.env.EXTERNAL_API_TOKEN;

  if (!API_URL || !API_TOKEN) {
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

    if (!response.ok) {
      let errorBody;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          errorBody = await response.json();
        } catch (e) {
          errorBody = { message: 'Failed to parse JSON error response from external API.' };
        }
      } else {
        // If it's not JSON, it's likely HTML or plain text.
        const textError = await response.text();
        // Don't send the full HTML to the client, just log it and send a generic error.
        console.error(`External API returned non-JSON error: ${textError.substring(0, 500)}...`);
        errorBody = { message: `External API returned a non-JSON response (status ${response.status}).` };
      }
      
      console.error(`External API error: ${response.status}`, errorBody);
      return NextResponse.json({ error: `External API failed with status ${response.status}`, details: errorBody }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching from external API:', error);
    return NextResponse.json({ error: 'Failed to connect to the external API.' }, { status: 502 }); // 502 Bad Gateway
  }
}
