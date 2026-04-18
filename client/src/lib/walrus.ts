// Walrus decentralized storage — all calls go through Next.js proxy to avoid CORS

export const walrusApi = {
  async upload(file: Uint8Array): Promise<string> {
    const resp = await fetch('/api/walrus/upload?epochs=3', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file.buffer as ArrayBuffer,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Walrus upload failed: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    const blobId = data.alreadyCertified?.blobId ?? data.newlyCreated?.blobObject?.blobId;
    if (!blobId) throw new Error('No blobId in Walrus response');
    return blobId;
  },

  async download(blobId: string): Promise<Uint8Array> {
    const resp = await fetch(`/api/walrus/download/${blobId}`);
    if (!resp.ok) throw new Error(`Walrus download failed: ${resp.status}`);
    return new Uint8Array(await resp.arrayBuffer());
  },
};
