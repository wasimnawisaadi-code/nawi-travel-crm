// Nawi AI Assistant — uses USER's own Google Gemini API key (GOOGLE_API_KEY)
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

// Convert OpenAI-style messages to Gemini format
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

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    if (!GOOGLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'GOOGLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const model = 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GOOGLE_API_KEY}`;

    const aiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: toGeminiMessages(messages),
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    });

    if (!aiRes.ok || !aiRes.body) {
      const errText = await aiRes.text();
      console.error('Gemini error:', aiRes.status, errText);
      const userMsg = aiRes.status === 429
        ? 'Rate limited by Google. Try again shortly.'
        : aiRes.status === 403
        ? 'Google API key invalid or Generative Language API not enabled.'
        : `Google AI error: ${errText.slice(0, 200)}`;
      return new Response(JSON.stringify({ error: userMsg }), {
        status: aiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Transform Gemini SSE → OpenAI-style SSE so the existing client parser works
    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nlIdx: number;
            while ((nlIdx = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, nlIdx).trim();
              buffer = buffer.slice(nlIdx + 1);
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (!data) continue;
              try {
                const json = JSON.parse(data);
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  const out = { choices: [{ delta: { content: text } }] };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
                }
              } catch { /* ignore */ }
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (e) {
          console.error('stream error', e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
