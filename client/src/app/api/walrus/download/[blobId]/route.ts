import { NextRequest, NextResponse } from 'next/server';
import { WALRUS_AGGREGATOR_URL } from '@/lib/config';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ blobId: string }> }
) {
  try {
    const { blobId } = await params;
    const resp = await fetch(`${WALRUS_AGGREGATOR_URL}/blobs/${blobId}`);

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Walrus download failed: ${resp.status}` },
        { status: resp.status }
      );
    }

    const buffer = await resp.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
