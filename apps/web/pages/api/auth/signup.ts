import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

const signupSchema = z.object({
  tenantName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional()
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const parseResult = signupSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.flatten() });
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-platform-origin': 'next-web'
      },
      body: JSON.stringify(parseResult.data)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: payload.error ?? 'Failed to create tenant' });
    }

    const payload = await response.json();
    // TODO: Attach session cookie using Supabase or NextAuth depending on implementation
    return res.status(201).json(payload);
  } catch (error) {
    console.error('Signup error', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}
