// Signaturit Bulk Sender - Supabase Edge Function
// Deploy: supabase functions deploy signaturit-proxy --no-verify-jwt
// Or paste this in Supabase Dashboard > Edge Functions > New Function
//
// This function acts as a CORS proxy between the browser and Signaturit API.
// It forwards multipart form-data requests with proper authentication.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const token = req.headers.get("x-signaturit-token");
    const apiUrl = req.headers.get("x-api-url");

    if (!token || !apiUrl) {
      return new Response(
        JSON.stringify({ error: "Missing x-signaturit-token or x-api-url headers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Forward the entire body as-is (multipart form-data)
    const body = await req.arrayBuffer();

    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": req.headers.get("content-type") || "",
      },
      body: body,
    });

    const data = await apiResponse.text();

    return new Response(data, {
      status: apiResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
