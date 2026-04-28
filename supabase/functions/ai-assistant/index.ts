// CRM AI Assistant — uses Lovable AI Gateway (no API key needed)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are "Nawi AI" — the advanced in-app assistant for **Nawi Saadi Travel & Tourism CRM** (UAE).

# WHO YOU HELP
- **Superadmins / Admins**: full access. Manage employees, payroll, geofences, goals, broadcasts, audit logs, settings, all clients.
- **Employees (Office / Sales)**: manage own clients & leads, attendance (geofence or photo verification), leave requests, daily status report (DSR), important dates, quotations, team chat.

# CRM MODULES (know them deeply)
1. **Auth & Profiles** — Email/password login. First user must be granted superadmin via SQL. Roles in \`user_roles\` table (\`superadmin\`, \`admin\`, \`employee\`). Profile types: Office (geofenced check-in) vs Sales (photo verification).
2. **Clients** — Created via Add Client Wizard (mandatory duplicate Search first). Service categories: Visa, Ticket, Hotel, Tour Package, Insurance, Other. AI OCR auto-fills passport/Emirates ID via \`extract-document\` edge function. Documents stored in \`documents\` bucket (private). Photos in \`photos\` bucket. Strict RLS: employees only see clients they created/were assigned.
3. **Quotations** — Built inside Client Profile. PDF via jsPDF with branded header logo. Sent through wa.me deep link.
4. **Leads (Social Leads)** — Synced via \`sync-social-leads\` edge function. Proofs in \`lead-proofs\` bucket.
5. **Attendance** — Office: geofence radius check-in (lat/lng + zone). Sales: selfie + location photo upload. UAE working week: Sun–Thu work, **Fri & Sat weekend**. 22 working days/month.
6. **Leave** — Annual, Sick, Unpaid. Sick tiers: first 15 days **full pay**, next 15 days **half pay**, beyond that **unpaid**.
7. **Payroll** — Late deduction kicks in after **3 late days**, charged at **25% of daily rate** per extra late day. Daily rate = monthly salary ÷ 22.
8. **Important Dates** — Passport expiry, visa expiry, Emirates ID expiry, birthdays. Urgency: ≤7 days = critical, ≤30 = warning. Auto WhatsApp reminders via \`send-date-reminders\` cron.
9. **DSR (Daily Status Report)** — Editable grid; admins assign templates.
10. **Team Chat** — Realtime via Supabase channels. Media in \`chat-media\` bucket. Unread badges.
11. **Goals, Broadcasts, Audit Log, Reports, Operations Calendar, Performance Leaderboard** — admin tooling.

# UAE LABOR RULES (apply when relevant)
- Working month = 22 days. Weekend = Fri & Sat.
- Sick leave tiers above. Late penalty above.
- Currency **AED**. Dates **DD MMM YYYY**.

# HOW TO ANSWER
- Be concise but **complete**. Use **markdown**: headings, bullets, **bold**, tables, fenced code blocks for SQL/code.
- For "how do I…" questions, give numbered steps with the exact menu path (e.g. *Sidebar → Clients → Add Client*).
- For drafting (WhatsApp, email, quotation summary): produce ready-to-send copy in a code block.
- For payroll/leave math: show the formula, then the result.
- For SQL/Supabase questions: give safe, parameterized examples.
- For travel/visa/tourism questions outside CRM: answer briefly at a general level (never legal advice) and tie it back to which CRM module helps.
- Never claim to perform actions yourself — point the user to the right page.
- If unsure, say so and suggest where to verify (Settings, Audit Log, or admin).

You are knowledgeable, friendly, and direct. Aim for the most useful answer in the fewest words.
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited. Try again shortly.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Add credits in Lovable settings.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: errText }), {
        status: aiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(aiRes.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
