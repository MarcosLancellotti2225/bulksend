// Signaturit API Proxy — Edge Function
// Supports POST (signatures, emails, SMS) and GET via x-method-override (templates)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

serve(async (req: Request) => {
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
    const methodOverride = req.headers.get("x-method-override");

    if (!token || !apiUrl) {
      return new Response(
        JSON.stringify({ error: "Missing x-signaturit-token or x-api-url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine HTTP method: default POST, or override with GET etc.
    const method = methodOverride?.toUpperCase() || "POST";

    let apiResponse;

    if (method === "GET") {
      // GET request (e.g. list templates)
      apiResponse = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
    } else {
      // POST request (signatures, emails, SMS)
      const body = await req.arrayBuffer();
      apiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": req.headers.get("content-type") || "",
        },
        body: body,
      });
    }

    const data = await apiResponse.text();

    return new Response(data, {
      status: apiResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
