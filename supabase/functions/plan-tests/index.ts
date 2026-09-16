import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Requirement {
  id: string;
  req_id: string;
  title: string;
  description: string;
  is_critical: boolean;
}

interface PlanItem {
  title: string;
  priority: "high" | "medium" | "low";
  suite: "smoke" | "sanity" | "regression";
  category: "happy_path" | "negative" | "boundary";
  description: string;
}

const PRIORITIES = ["high", "medium", "low"];
const SUITES = ["smoke", "sanity", "regression"];
const CATEGORIES = ["happy_path", "negative", "boundary"];

async function getAIConfig(supabase: any) {
  const { data } = await supabase.from("app_settings").select("key, value");
  const settings: Record<string, string> = {};
  for (const row of data || []) settings[row.key] = row.value;
  return {
    apiKey: settings["OPENAI_API_KEY"] || Deno.env.get("OPENAI_API_KEY") || "",
    baseUrl: settings["AI_BASE_URL"] || "https://api.openai.com",
    model: settings["AI_MODEL"] || "deepseek-v4-flash-0731",
  };
}

async function chatCompletion(apiKey: string, baseUrl: string, model: string, prompt: string, temperature: number, maxTokens: number): Promise<string> {
  const url = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  const response = await fetch(url + "v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature, max_tokens: maxTokens }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error: ${response.status} — ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function stripFences(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function extractJson(content: string): any {
  const cleaned = stripFences(content);
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch { /* fall through */ }
  }
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }
  throw new Error("No valid JSON in AI response");
}

function normalizeItem(raw: any, index: number): PlanItem {
  const title = (raw?.title || `Test scenario ${index + 1}`).toString();
  const priority = PRIORITIES.includes(raw?.priority) ? raw.priority : "medium";
  const suite = SUITES.includes(raw?.suite) ? raw.suite : "sanity";
  const category = CATEGORIES.includes(raw?.category) ? raw.category : "happy_path";
  return {
    title,
    priority,
    suite,
    category,
    description: (raw?.description || "").toString(),
  };
}

async function planWithAI(requirements: Requirement[], cfg: any): Promise<{ name: string; summary: string; items: PlanItem[] }> {
  const reqText = requirements.map(r => `${r.req_id}${r.is_critical ? " [CRITICAL]" : ""}: ${r.title} — ${r.description}`).join("\n");

  const prompt = `You are a senior QA test planner. Given the requirements below, produce a prioritized test plan.

Return ONLY valid JSON with exactly these keys:
- "name": short plan name
- "summary": 1-2 sentence plain-English summary of the testing strategy
- "items": array of test scenarios, each with:
  - "title": short scenario name
  - "priority": one of "high", "medium", "low"
  - "suite": one of "smoke", "sanity", "regression"
  - "category": one of "happy_path", "negative", "boundary"
  - "description": one sentence describing what the test verifies

Rules:
- Cover every requirement at least once.
- Critical requirements get at least one "high" priority smoke test.
- Balance happy path, negative, and boundary coverage.
- Do not invent features beyond the requirements.
- 2-4 items per requirement.

Requirements:
${reqText}`;

  const content = await chatCompletion(cfg.apiKey, cfg.baseUrl, cfg.model, prompt, 0.3, 2500);
  const parsed = extractJson(content);

  const itemsRaw = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  const items = itemsRaw.map(normalizeItem);

  return {
    name: parsed?.name?.toString() || "Test Plan",
    summary: parsed?.summary?.toString() || "",
    items,
  };
}

function planRuleBased(requirements: Requirement[]): { name: string; summary: string; items: PlanItem[] } {
  const items: PlanItem[] = [];
  for (const req of requirements) {
    const feature = req.title.replace(/[^A-Za-z0-9 ]+/g, "").trim().slice(0, 48) || "Feature";
    items.push({
      title: `${req.title} — happy path`,
      priority: req.is_critical ? "high" : "medium",
      suite: "smoke",
      category: "happy_path",
      description: `Verify the main ${feature} flow works end to end with valid inputs.`,
    });
    items.push({
      title: `${req.title} — invalid input`,
      priority: "medium",
      suite: "sanity",
      category: "negative",
      description: `Verify ${feature} rejects invalid or missing input with a clear error.`,
    });
    items.push({
      title: `${req.title} — boundary`,
      priority: "low",
      suite: "regression",
      category: "boundary",
      description: `Verify ${feature} behaves correctly at boundary values and edge cases.`,
    });
  }
  return {
    name: "Test Plan",
    summary: `Rule-based plan covering ${requirements.length} requirement(s) with happy path, negative, and boundary scenarios.`,
    items,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { project_id, requirement_ids } = await req.json();

    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = supabase.from("requirements").select("*").eq("project_id", project_id);
    if (Array.isArray(requirement_ids) && requirement_ids.length > 0) {
      query = query.in("id", requirement_ids);
    }
    const { data: requirements, error: reqError } = await query;

    if (reqError) throw reqError;
    if (!requirements || requirements.length === 0) {
      return new Response(JSON.stringify({ error: "No requirements found to plan" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = await getAIConfig(supabase);

    let plan: { name: string; summary: string; items: PlanItem[] };
    let method = "ai";

    if (cfg.apiKey) {
      try {
        plan = await planWithAI(requirements as Requirement[], cfg);
      } catch {
        plan = planRuleBased(requirements as Requirement[]);
        method = "rule-based";
      }
    } else {
      plan = planRuleBased(requirements as Requirement[]);
      method = "rule-based";
    }

    if (plan.items.length === 0) {
      plan = planRuleBased(requirements as Requirement[]);
      method = "rule-based";
    }

    const { data: inserted, error: insertError } = await supabase
      .from("test_plans")
      .insert({
        project_id,
        name: plan.name,
        summary: plan.summary,
        status: "draft",
        items: plan.items,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({
      plan_id: inserted.id,
      name: plan.name,
      summary: plan.summary,
      items: plan.items,
      item_count: plan.items.length,
      method,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
