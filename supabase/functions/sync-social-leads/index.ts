// Sync leads from public Google Sheets (WhatsApp / Instagram / Messenger)
// Sheets are exported as CSV via gviz endpoint. Dedup by source+unique_key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SHEETS = {
  whatsapp:  { id: "1Z8Qj1U972Ktp4iOK3-JWPcgk_vEDJ58aJKH4daD7i0E", gid: "0" },
  instagram: { id: "1Z8Qj1U972Ktp4iOK3-JWPcgk_vEDJ58aJKH4daD7i0E", gid: "2060179211" },
  messenger: { id: "1Z8Qj1U972Ktp4iOK3-JWPcgk_vEDJ58aJKH4daD7i0E", gid: "1104863519" },
} as const;

function csvUrl(id: string, gid: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// Gid → sheet tab name map (filled lazily from Sheets API metadata)
const SHEET_TAB_CACHE: Record<string, string> = {};

async function getTabName(spreadsheetId: string, gid: string, apiKey: string): Promise<string | null> {
  const cacheKey = `${spreadsheetId}:${gid}`;
  if (SHEET_TAB_CACHE[cacheKey]) return SHEET_TAB_CACHE[cacheKey];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const sheet = json.sheets?.find((s: any) => String(s.properties?.sheetId) === String(gid));
  const title = sheet?.properties?.title || null;
  if (title) SHEET_TAB_CACHE[cacheKey] = title;
  return title;
}

// Fetch via Google Sheets API (uses GOOGLE_API_KEY) — works for sheets shared "Anyone with link"
async function fetchViaSheetsApi(spreadsheetId: string, gid: string, apiKey: string): Promise<string[][] | null> {
  const tab = await getTabName(spreadsheetId, gid, apiKey);
  if (!tab) return null;
  const range = encodeURIComponent(tab);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Sheets API error", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return (json.values as string[][]) || [];
}

// Minimal CSV parser (handles quoted fields with commas + escaped quotes)
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let i = 0;
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      cur += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(cur); cur = ""; i++; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = []; i++; continue;
    }
    cur += c; i++;
  }
  if (cur || row.length) { row.push(cur); if (row.some(v => v.trim() !== "")) rows.push(row); }
  return rows;
}

function rowToObject(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h.trim()] = (row[i] || "").trim(); });
  return obj;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toBool(s: string): boolean {
  return /^(true|yes|1)$/i.test(s.trim());
}

async function fetchAndParse(spreadsheetId: string, gid: string, apiKey: string | undefined): Promise<Record<string, string>[]> {
  // Prefer Google Sheets API when GOOGLE_API_KEY is configured
  if (apiKey) {
    const rows = await fetchViaSheetsApi(spreadsheetId, gid, apiKey);
    if (rows && rows.length >= 2) {
      const headers = rows[0];
      return rows.slice(1).map(r => rowToObject(headers, r));
    }
  }
  // Fallback: public CSV export
  const res = await fetch(csvUrl(spreadsheetId, gid), { redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch failed ${res.status}`);
  const text = await res.text();
  const all = parseCSV(text);
  if (all.length < 2) return [];
  const headers = all[0];
  return all.slice(1).map(r => rowToObject(headers, r));
}

// Find a value across multiple possible header names (case-insensitive)
function pick(obj: Record<string, string>, ...keys: string[]): string {
  const lc: Record<string, string> = {};
  for (const k of Object.keys(obj)) lc[k.toLowerCase()] = obj[k];
  for (const k of keys) {
    const v = lc[k.toLowerCase()];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function buildLead(source: "whatsapp" | "instagram" | "messenger", row: Record<string, string>) {
  const first = pick(row, "First Name", "first_name", "Firstname");
  const last = pick(row, "Last Name", "last_name", "Lastname");
  const full = pick(row, "Full Name", "Name", "Full name") || `${first} ${last}`.trim();

  let unique_key = "";
  let phone = "";
  let username = "";
  let pageId = pick(row, "Page ID", "page_id");

  if (source === "whatsapp") {
    phone = pick(row, "Phone", "WhatsApp ID", "whatsapp_id", "Whatsapp ID", "WA ID");
    unique_key = pick(row, "WhatsApp ID", "Phone", "Contact ID", "Whatsapp ID", "WA ID") || phone;
  } else if (source === "instagram") {
    // Instagram sheets sometimes label differently
    username = pick(row, "Username", "username", "Instagram Username", "IG Username", "Handle", "User Name");
    const igId = pick(row, "Instagram ID", "instagram_id", "IG ID", "User ID", "Subscriber ID", "PSID", "ID");
    unique_key = igId || username || full || `${first}-${last}`.trim();
  } else {
    const msgrId = pick(row, "Messenger ID", "messenger_id", "PSID", "Subscriber ID", "User ID", "ID");
    unique_key = msgrId || pageId || full || `${first}-${last}`.trim();
  }

  if (!unique_key) return null;

  return {
    source,
    unique_key,
    first_name: first || null,
    last_name: last || null,
    full_name: full || null,
    phone: phone || null,
    username: username || null,
    page_id: pageId || null,
    language: pick(row, "Language") || null,
    gender: pick(row, "Gender") || null,
    timezone: pick(row, "Timezone") || null,
    subscribed: row["Subscribed"] !== undefined ? toBool(row["Subscribed"]) : true,
    opted_in: row["Opted-In"] !== undefined ? toBool(row["Opted-In"]) : true,
    last_interaction: parseDate(pick(row, "Last Interaction")),
    last_seen: parseDate(pick(row, "Last Seen")),
    messaging_window: pick(row, "Messaging Window") || null,
    raw: row,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const summary = { whatsapp: { new: 0, updated: 0 }, instagram: { new: 0, updated: 0 }, messenger: { new: 0, updated: 0 } };

  try {
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    for (const source of Object.keys(SHEETS) as Array<keyof typeof SHEETS>) {
      const { id, gid } = SHEETS[source];
      const rows = await fetchAndParse(id, gid, GOOGLE_API_KEY);

      for (const row of rows) {
        const lead = buildLead(source, row);
        if (!lead) continue;

        // Check existing
        const { data: existing } = await supabase
          .from("social_leads")
          .select("id, status")
          .eq("source", source)
          .eq("unique_key", lead.unique_key)
          .maybeSingle();

        if (existing) {
          await supabase.from("social_leads").update({
            first_name: lead.first_name, last_name: lead.last_name, full_name: lead.full_name,
            phone: lead.phone, username: lead.username, page_id: lead.page_id,
            language: lead.language, gender: lead.gender, timezone: lead.timezone,
            subscribed: lead.subscribed, opted_in: lead.opted_in,
            last_interaction: lead.last_interaction, last_seen: lead.last_seen,
            messaging_window: lead.messaging_window, raw: lead.raw,
          }).eq("id", existing.id);
          summary[source].updated++;
        } else {
          const { data: idData } = await supabase.rpc("generate_display_id", { prefix: "LEAD" });
          const display_id = (idData as string) || `LEAD-${Date.now().toString().slice(-5)}`;
          const { data: inserted, error } = await supabase
            .from("social_leads")
            .insert({ ...lead, display_id, status: "NEW" })
            .select("id, full_name, source")
            .single();
          if (!error && inserted) {
            summary[source].new++;
            // Notify all admins
            const { data: admins } = await supabase
              .from("user_roles").select("user_id")
              .in("role", ["admin", "superadmin"]);
            if (admins) {
              const notifs = admins.map((a: any) => ({
                user_id: a.user_id,
                title: `New ${source} lead`,
                message: `${inserted.full_name || "Unnamed"} just messaged via ${source}.`,
                type: "lead",
              }));
              if (notifs.length) await supabase.from("notifications").insert(notifs);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("sync-social-leads error", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
