const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const countryCode = req.headers.get("cf-ipcountry");
  const ip = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  return new Response(JSON.stringify({
    ip,
    city: req.headers.get("cf-ipcity"),
    region: req.headers.get("cf-region"),
    country: null,
    countryCode,
    lat: null,
    lon: null,
    timezone: req.headers.get("cf-timezone"),
    isp: null,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
