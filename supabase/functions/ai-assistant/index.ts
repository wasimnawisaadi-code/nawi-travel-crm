// Nawi AI Assistant — uses Google Service Account (GOOGLE_CLOUD_SA_JSON) for Gemini
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are "Nawi AI" — the advanced in-app assistant for **Nawi Saadi Travel & Tourism CRM** (UAE).

# WHO YOU HELP
- **Superadmins / Admins**: full access. Manage employees, payroll, geofences, goals, broadcasts, audit logs, settings, all clients.
- **Employees (Office / Sales)**: manage own clients & leads, attendance (geofence or photo verification), leave requests, daily status report (DSR), important dates, quotations, team chat.

# CRM MODULES
1. **Auth & Profiles** — Email/password login. First user must be granted superadmin via SQL. Roles in user_roles table.
2. **Clients** — Add Client Wizard with mandatory duplicate Search. AI OCR auto-fills passport/Emirates ID. Strict RLS.
3. **Quotations** — PDF via jsPDF with branded logo. Sent through wa.me deep link.
4. **Leads (Social Leads)** — Synced from Google Sheets (WhatsApp/Instagram/Messenger).
5. **Attendance** — Office: geofence. Sales: selfie + location. Sun-Thu work, Fri-Sat weekend. 22 working days/month.
6. **Leave** — Sick tiers: first 15 days full pay, next 15 half pay, beyond unpaid.
7. **Payroll** — Late deduction after 3 late days at 25% daily rate. Daily rate = monthly salary / 22.
8. **Important Dates** — Passport/visa/Emirates ID expiry, birthdays. Auto WhatsApp reminders.
9. **DSR, Team Chat, Goals, Broadcasts, Audit Log, Reports, Operations Calendar, Performance Leaderboard.**

# UAE LABOR RULES
- Working month = 22 days. Weekend = Fri & Sat. Currency AED. Dates DD MMM YYYY.

# HOW TO ANSWER
- Concise, complete, markdown-formatted (headings, bullets, tables, code blocks).
- Step-by-step menu paths (e.g. *Sidebar → Clients → Add Client*).
- For drafts (WhatsApp/email/quotation): ready-to-send copy in code block.
- For payroll/leave math: show formula then result.
- Never claim to perform actions yourself — guide the user to the right page.
`;

// ============ Service Account → OAuth Access Token ============
let cachedToken: { token: string; exp: number } | null = null;

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') bytes = new TextEncoder().encode(data);
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else bytes = data;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(scope: string): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;

  const saJson = Deno.env.get('GOOGLE_CLOUD_SA_JSON');
  if (!saJson) throw new Error('GOOGLE_CLOUD_SA_JSON not configured');
  const sa = JSON.parse(saJson);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;

  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokRes.ok) throw new Error(`Token exchange failed: ${await tokRes.text()}`);
  const tok = await tokRes.json();
  cachedToken = { token: tok.access_token, exp: Date.now() + (tok.expires_in * 1000) };
  return tok.access_token;
}
// ============ End Service Account helper ============

async function callGeminiWithApiKey(messages: Array<{ role: string; content: string }>) {
  const apiKey = Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_API_KEY not configured');

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];
  let lastErr = '';
  let lastStatus = 0;

  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: toGeminiMessages(messages),
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    });

    if (res.ok) {
      const json = await res.json();
      return json.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
    }

    lastErr = await res.text();
    lastStatus = res.status;
    console.error(`Gemini ${model} failed [${res.status}]:`, lastErr.slice(0, 200));
    // Only try next model on overload; abort on auth/quota errors
    if (res.status !== 503 && res.status !== 500) break;
  }

  if (lastStatus === 503) {
    throw new Error('All Gemini models are currently overloaded. Please try again in a moment.');
  }
  throw new Error(`Google AI error: ${lastErr.slice(0, 300)}`);
}

function toGeminiMessages(messages: Array<{ role: string; content: string }>) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use Generative Language API with API key (most reliable). Vertex requires model enablement per project.
    let aiText = '';
    try {
      aiText = await callGeminiWithApiKey(messages);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Gemini API key call failed:', msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: aiText } }] })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('ai-assistant error', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
