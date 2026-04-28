// Document OCR — uses USER's own Google Cloud Vision + Gemini API key (GOOGLE_API_KEY)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Strip "data:image/...;base64," prefix if present
function stripBase64Prefix(b64: string): string {
  const idx = b64.indexOf(",");
  return idx >= 0 ? b64.slice(idx + 1) : b64;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, docType, service, serviceSubcategory } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) {
      return new Response(JSON.stringify({ error: "GOOGLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanB64 = stripBase64Prefix(imageBase64);

    // Step 1: Google Cloud Vision OCR — extract raw text from image
    const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;
    const visionRes = await fetch(visionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: cleanB64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
        }],
      }),
    });

    if (!visionRes.ok) {
      const err = await visionRes.text();
      console.error("Vision API error:", visionRes.status, err);
      const userMsg = visionRes.status === 403
        ? "Google API key invalid or Cloud Vision API not enabled."
        : `Vision API error: ${err.slice(0, 200)}`;
      return new Response(JSON.stringify({ error: userMsg }), {
        status: visionRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const visionJson = await visionRes.json();
    const rawText = visionJson.responses?.[0]?.fullTextAnnotation?.text || "";

    if (!rawText) {
      return new Response(JSON.stringify({ success: true, data: {}, warning: "No text detected in image" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Gemini — structure the OCR text into our schema
    const prompt = `You are a document data extractor for Nawi Saadi Travel & Tourism (UAE).
Document type: ${docType || "unknown"}. Service context: ${service || "unknown"}${serviceSubcategory ? ` (${serviceSubcategory})` : ""}.

Below is the OCR text extracted from the document. Extract structured data and return ONLY a JSON object (no prose, no markdown fences) with these fields (use null when not found):
fullName, passportNo, nationality, dateOfBirth (YYYY-MM-DD), passportExpiry (YYYY-MM-DD), passportIssueDate (YYYY-MM-DD), placeOfBirth, gender (Male/Female), emiratesId, visaNumber, visaExpiry (YYYY-MM-DD), visaType, sponsor, profession, address, phoneNumber, email, bloodGroup, maritalStatus, fatherName, motherName, issuingAuthority, documentNumber.

Also include "otherDetails" as an object of any extra key/value pairs you find.

OCR TEXT:
"""
${rawText}
"""

Return JSON only.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`;
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, err);
      // Still return raw text so user isn't blocked
      return new Response(JSON.stringify({
        success: true, data: { otherDetails: { rawText } },
        warning: "Structuring failed, returning raw OCR text",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const geminiJson = await geminiRes.json();
    const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { extracted = JSON.parse(match[0]); } catch { extracted = { otherDetails: { rawText } }; }
      } else {
        extracted = { otherDetails: { rawText } };
      }
    }

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
