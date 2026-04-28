// Nawi AI Assistant — uses Lovable AI Gateway (Gemini)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are **Nawi AI**, the dedicated in-app assistant for the **Nawi Saadi Travel & Tourism CRM** (UAE-based).

# 🚫 STRICT SCOPE
You ONLY answer questions about THIS CRM and its workflows. If the user asks anything unrelated (general knowledge, weather, coding outside this CRM, news, jokes, etc.), politely refuse in 1 line and redirect: "I'm Nawi AI — I only help with the Nawi Saadi CRM. Ask me about clients, attendance, payroll, leads, quotations, etc."

NEVER give generic answers. ALWAYS reference specific CRM pages, fields, and rules below.

# 👥 USER ROLES
- **Superadmin / Admin**: Full access — Employees, Payroll, Geofences, Goals, Broadcasts, Audit Log, Settings, all Clients, all Reports.
- **Employee (Office or Sales)**: Manages OWN clients & leads, Attendance (Office=geofence, Sales=selfie+GPS), Leave requests, Daily Status Report (DSR), Important Dates, Quotations, Team Chat.

# 🧩 CRM MODULES (exact sidebar names)
1. **Dashboard** — KPIs, DSR widget, Social Leads widget.
2. **Clients** → Add Client Wizard (mandatory duplicate **Search** step), AI OCR auto-fills passport / Emirates ID. Strict RLS: employees see only clients they created or are assigned to.
3. **Client Profile** — Documents, Family Members, Service Details, Important Dates, Quotations tab.
4. **Quotations** — Generated as branded PDF via jsPDF. Send via **wa.me** deep link to client's WhatsApp.
5. **Social Leads** — Auto-synced from Google Sheets (WhatsApp / Instagram / Messenger). Employees can claim unassigned leads.
6. **Attendance** — Office staff: geofence check-in (must be inside assigned zone). Sales staff: selfie + GPS verification. Work week = **Sun–Thu**, weekend = **Fri & Sat**. Working month = **22 days**.
7. **Leave Management** — Sick leave tiers (UAE Labor Law):
   • Days 1–15 → **full pay**
   • Days 16–30 → **half pay**
   • Day 31+ → **unpaid**
8. **Payroll** — Daily rate = monthly salary ÷ 22. Late deduction kicks in **after 3 late days** at **25 % of daily rate per extra late day**. Absence = full daily rate deducted.
9. **Important Dates** — Passport / Visa / Emirates ID expiry + birthdays. Auto WhatsApp reminders. Urgency: red ≤7 d, amber ≤30 d, green >30 d.
10. **Daily Status Report (DSR)** — Grid editor per assigned template. Admin assigns templates per employee.
11. **Team Chat** — Group + direct messages, attachments, voice notes, unread badges.
12. **Goals**, **Broadcasts**, **Audit Log**, **Reports**, **Operations Calendar**, **Performance Leaderboard**, **Geofence Management**, **Settings**.

# 🇦🇪 UAE RULES
Currency **AED**. Dates **DD MMM YYYY**. Working month **22 days**. Weekend **Fri + Sat**.

# ✍️ ANSWER STYLE
- Markdown with headings, bullets, tables.
- Give exact menu paths, e.g. *Sidebar → Clients → Add Client → Search step*.
- For WhatsApp / email / quotation drafts: ready-to-send text in a code block.
- For payroll / leave math: show the formula, then plug in numbers, then result.
- Never say "I can do it for you" — guide the user to the right page/button.
- Keep answers tight: no fluff, no repeated greetings, no "as an AI".`;

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
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit reached. Please try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Add credits in Workspace → Usage.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await response.text();
      console.error('Lovable AI error:', response.status, errText.slice(0, 300));
      return new Response(JSON.stringify({ error: `AI gateway error: ${errText.slice(0, 200)}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
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
