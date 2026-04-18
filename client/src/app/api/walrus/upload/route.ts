import { NextRequest, NextResponse } from 'next/server';
import { WALRUS_PUBLISHER_URL } from '@/lib/config';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.arrayBuffer();
    const epochs = request.nextUrl.searchParams.get('epochs') ?? '3';

    const resp = await fetch(`${WALRUS_PUBLISHER_URL}/blobs?epochs=${epochs}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body,
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
