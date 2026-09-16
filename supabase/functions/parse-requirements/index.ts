import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function getAIConfig(supabase: any) {
  const { data } = await supabase.from("app_settings").select("key, value");
  const s: Record<string, string> = {};
  for (const row of data || []) s[row.key] = row.value;
  return { apiKey: s["OPENAI_API_KEY"] || "", baseUrl: s["AI_BASE_URL"] || "https://api.openai.com", model: s["AI_MODEL"] || "deepseek-v4-flash-0731" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { text, project_id } = await req.json();
    if (!text || !project_id) return new Response(JSON.stringify({ error: "text and project_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const cfg = await getAIConfig(supabase);
    let requirements: { project_id: string; req_id: string; title: string; description: string; source: string; is_critical: boolean; has_coverage: boolean }[] = [];

    if (cfg.apiKey) {
      const prompt = `You are a QA analyst. Parse the following natural language description into testable requirements.
Return ONLY a JSON array of objects, each with: title (short), description (detailed, including acceptance criteria), is_critical (boolean).

Text: "${text}"

Rules:
- Break down into 2-6 distinct requirements
- Each requirement should be independently testable
- Include specific details from the text (timeouts, limits, values)
- Mark security/critical-path requirements as critical`;

      const url = cfg.baseUrl.endsWith("/") ? cfg.baseUrl : cfg.baseUrl + "/";
      const resp = await fetch(url + "v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: 1500 }),
      });
      if (!resp.ok) throw new Error(`AI API error: ${resp.status}`);
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || "[]";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON in response");
      const parsed = JSON.parse(jsonMatch[0]);
      requirements = parsed.map((r: any, i: number) => ({
        project_id, req_id: `NL-${String(i + 1).padStart(2, "0")}`,
        title: r.title || `Requirement ${i + 1}`,
        description: r.description || "",
        source: "manual", is_critical: !!r.is_critical, has_coverage: false,
      }));
    } else {
      // Fallback: simple sentence-based parsing
      const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15);
      requirements = sentences.slice(0, 6).map((s, i) => ({
        project_id, req_id: `NL-${String(i + 1).padStart(2, "0")}`,
        title: s.split(",")[0].slice(0, 60),
        description: s, source: "manual",
        is_critical: /login|password|security|payment|checkout/i.test(s),
        has_coverage: false,
      }));
    }

    let inserted: any[] = [];
    if (requirements.length > 0) {
      const { data, error } = await supabase.from("requirements").insert(requirements).select();
      if (error) throw error;
      inserted = data || [];
    }

    return new Response(JSON.stringify({ parsed: inserted.length, requirements: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
