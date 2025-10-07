import type { NextApiRequest, NextApiResponse } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const response = await fetch(`${baseUrl}/auth/accept-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-platform-origin': 'next-web'
      },
      body: JSON.stringify(req.body ?? {})
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json(payload);
    }

    return res.status(response.status).json(payload);
  } catch (error) {
    console.error('Accept invite error', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}

export default handler;
