import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, docType, service, serviceSubcategory } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a document data extraction assistant for a travel & tourism company (Nawi Saadi Travel & Tourism, UAE).
You will receive an image of a document. Extract ALL relevant information from the document.

The document type is: ${docType || "unknown"}
The service context is: ${service || "unknown"} ${serviceSubcategory ? `(${serviceSubcategory})` : ""}

Extract and return a JSON object with these fields (use null for fields you cannot find):
- fullName: Full name as shown on document
- passportNo: Passport number
- nationality: Nationality/country
- dateOfBirth: Date of birth (YYYY-MM-DD format)
- passportExpiry: Passport expiry date (YYYY-MM-DD format)
- passportIssueDate: Passport issue date (YYYY-MM-DD format)
- placeOfBirth: Place of birth
- gender: Gender (Male/Female)
- emiratesId: Emirates ID number
- visaNumber: Visa number
- visaExpiry: Visa expiry date (YYYY-MM-DD format)
- visaType: Type of visa
- sponsor: Sponsor name
- profession: Profession/occupation
- address: Address
- phoneNumber: Phone number
- email: Email address
- bloodGroup: Blood group
- maritalStatus: Marital status
- fatherName: Father's name
- motherName: Mother's name
- issuingAuthority: Issuing authority
- documentNumber: Any document/reference number
- otherDetails: Any other relevant details as key-value pairs

IMPORTANT: Only include fields that you can actually read from the document. Return valid JSON only.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all information from this document image. Return ONLY valid JSON.",
              },
              {
                type: "image_url",
                image_url: { url: imageBase64 },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_document_data",
              description: "Extract structured data from a document image",
              parameters: {
                type: "object",
                properties: {
                  fullName: { type: "string", description: "Full name" },
                  passportNo: { type: "string", description: "Passport number" },
                  nationality: { type: "string", description: "Nationality" },
                  dateOfBirth: { type: "string", description: "Date of birth YYYY-MM-DD" },
                  passportExpiry: { type: "string", description: "Passport expiry YYYY-MM-DD" },
                  passportIssueDate: { type: "string", description: "Passport issue date YYYY-MM-DD" },
                  placeOfBirth: { type: "string", description: "Place of birth" },
                  gender: { type: "string", enum: ["Male", "Female"] },
                  emiratesId: { type: "string", description: "Emirates ID number" },
                  visaNumber: { type: "string", description: "Visa number" },
                  visaExpiry: { type: "string", description: "Visa expiry YYYY-MM-DD" },
                  visaType: { type: "string", description: "Type of visa" },
                  sponsor: { type: "string", description: "Sponsor name" },
                  profession: { type: "string", description: "Profession" },
                  address: { type: "string", description: "Address" },
                  phoneNumber: { type: "string", description: "Phone number" },
                  email: { type: "string", description: "Email" },
                  bloodGroup: { type: "string", description: "Blood group" },
                  maritalStatus: { type: "string", description: "Marital status" },
                  fatherName: { type: "string", description: "Father name" },
                  motherName: { type: "string", description: "Mother name" },
                  issuingAuthority: { type: "string", description: "Issuing authority" },
                  documentNumber: { type: "string", description: "Document number" },
                  otherDetails: {
                    type: "object",
                    description: "Any other relevant details",
                    additionalProperties: { type: "string" },
                  },
                },
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_document_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    let extracted = {};

    // Parse tool call response
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        extracted = JSON.parse(toolCall.function.arguments);
      } catch {
        // Try parsing from content
        const content = result.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
      }
    } else {
      // Fallback: parse from content
      const content = result.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
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
