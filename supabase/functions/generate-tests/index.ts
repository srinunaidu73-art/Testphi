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
  source: string;
  is_critical: boolean;
}

interface Step {
  step_number: number;
  keyword: string;
  action: string;
  expected_result?: string;
}

interface GeneratedTest {
  project_id: string;
  title: string;
  gherkin: string;
  test_type: string;
  category: string;
  source_req_ids: string[];
  status: string;
  validation_score: number;
  steps: Step[];
  recent_runs: string[];
  is_quarantined: boolean;
}

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

function extractJsonArray(content: string): any[] {
  const fenced = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const arrayMatch = fenced.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  const objMatch = fenced.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (Array.isArray(parsed.tests)) return parsed.tests;
      if (Array.isArray(parsed.test_cases)) return parsed.test_cases;
      if (Array.isArray(parsed.scenarios)) return parsed.scenarios;
    } catch { /* fall through */ }
  }
  throw new Error("No JSON array found in AI response");
}

function repairItem(t: any, fallbackTitle: string): any {
  if (!t || typeof t !== "object") return null;
  const title = (t.title || fallbackTitle).toString();
  const steps = normalizeSteps(t.steps);
  if (steps.length === 0) return null;
  return { ...t, title, steps };
}

function normalizeSteps(raw: any): Step[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any, i: number) => ({
    step_number: typeof s.step_number === "number" ? s.step_number : i + 1,
    keyword: (s.keyword || "And").toString(),
    action: (s.action || "").toString(),
    expected_result: s.expected_result ? s.expected_result.toString() : undefined,
  }));
}

function gherkinFromSteps(title: string, steps: Step[]): string {
  const lines = steps.map(s => `    ${s.keyword} ${s.action}`).join("\n");
  return `Feature: ${title}\n  Scenario: ${title}\n${lines}`;
}

async function generateWithAI(requirement: Requirement, testType: string, cfg: any): Promise<GeneratedTest[]> {
  const prompt = `You are a senior QA automation engineer. Generate 3 concrete, executable test scenarios for the requirement below.

These tests will be run by a browser automation tool (Puppeteer). Every step MUST describe a specific, real browser action that can be automated. Vague steps like "the user performs the main action" are useless and will be rejected.

Return ONLY valid JSON: an array of exactly 3 objects, each with:
- "title": short scenario name
- "gherkin": full Gherkin text (Feature + Scenario with Given/When/Then/And)
- "category": one of "happy_path", "negative", "boundary"
- "steps": array of { "step_number": number, "keyword": "Given|When|Then|And", "action": string, "expected_result": string }

CRITICAL RULES FOR EXECUTABLE STEPS:
- Given steps MUST start with "navigate to <URL>" or "the user is on the <page name> page at <URL>" — always include the full URL from the requirement.
- When steps MUST use one of these exact action patterns:
  - "type '<value>' into the <field name> field" (e.g. "type 'standard_user' into the username field")
  - "click the <button text> button" (e.g. "click the Login button")
  - "click the <link text> link"
  - "select '<option>' from the <select name> dropdown"
  - "press the <key> key"
- Then steps MUST verify something visible: "see <text> on the page" or "see the <element> is visible" or "see the URL contains <path>"
- Use the ACTUAL field names, button texts, and links mentioned in the requirement description. Do not invent elements.
- If the requirement mentions form fields, use those exact field names. If it mentions buttons, use those exact button texts.
- One scenario is the happy path (valid inputs, expect success), one covers invalid/error input (bad data, expect error message), one covers boundary cases (empty, max length, special chars).
- 3-8 steps per scenario. Every step must be specific enough that a human could follow it without any other documentation.
- Target test type: ${testType}.

Requirement:
- ID: ${requirement.req_id}
- Title: ${requirement.title}
- Description: ${requirement.description}

Return ONLY the JSON array, no other text.`;

  let parsed: any[] = [];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await chatCompletion(cfg.apiKey, cfg.baseUrl, cfg.model, prompt, attempt === 0 ? 0.3 : 0.5, 4000);
      parsed = extractJsonArray(content);
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (parsed.length === 0) throw lastError instanceof Error ? lastError : new Error("AI returned no tests");

  const repaired = parsed
    .map(t => repairItem(t, `${requirement.title} — test`))
    .filter(Boolean) as any[];

  if (repaired.length === 0) throw new Error("AI returned no usable tests");

  return repaired.map((t: any) => {
    const steps = normalizeSteps(t.steps);
    const title = t.title.toString();
    return {
      project_id: "",
      title,
      gherkin: (t.gherkin || gherkinFromSteps(title, steps)).toString(),
      test_type: testType,
      category: ["happy_path", "negative", "boundary"].includes(t.category) ? t.category : "happy_path",
      source_req_ids: [requirement.id],
      status: "draft",
      validation_score: 0,
      steps,
      recent_runs: [],
      is_quarantined: false,
    };
  });
}

function makeTest(requirement: Requirement, testType: string, title: string, category: string, steps: Step[]): GeneratedTest {
  return {
    project_id: "",
    title,
    gherkin: gherkinFromSteps(title, steps),
    test_type: testType,
    category,
    source_req_ids: [requirement.id],
    status: "draft",
    validation_score: 0,
    steps,
    recent_runs: [],
    is_quarantined: false,
  };
}

function parseElementsFromDescription(desc: string): { url: string; fields: string[]; buttons: string[]; headings: string[] } {
  const urlMatch = desc.match(/https?:\/\/[^\s)]+/i);
  const url = urlMatch ? urlMatch[0].replace(/[.,]+$/, "") : "";

  const fields: string[] = [];
  const fieldMatch = desc.match(/fields:\s*([^.]+)/i);
  if (fieldMatch) {
    fields.push(...fieldMatch[1].split(",").map(f => f.trim()).filter(f => f.length > 0 && f.length < 40));
  }

  const buttons: string[] = [];
  const btnMatch = desc.match(/Interactive elements:\s*([^.]+)/i);
  if (btnMatch) {
    buttons.push(...btnMatch[1].split(",").map(b => b.trim()).filter(b => b.length > 0 && b.length < 40));
  }

  const headings: string[] = [];
  const headingMatch = desc.match(/Page sections:\s*([^.]+)/i);
  if (headingMatch) {
    headings.push(...headingMatch[1].split(",").map(h => h.trim()).filter(h => h.length > 0 && h.length < 60));
  }

  return { url, fields, buttons, headings };
}

function generateRuleBased(requirement: Requirement, testType: string): GeneratedTest[] {
  const title = requirement.title.trim();
  const desc = (requirement.description || title).trim();
  const feature = title.replace(/[^A-Za-z0-9 ]+/g, "").trim().slice(0, 48) || "Feature";
  const { url, fields, buttons } = parseElementsFromDescription(desc);
  const pageUrl = url || desc.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[.,]+$/, "") || "";
  const limit = desc.match(/(\d+)\s*(seconds?|minutes?|hours?|attempts?|times?|characters?|items?|days?|retries?|requests?)/i);

  const hasLoginForm = fields.some(f => /user|email|username/i.test(f)) && fields.some(f => /password/i.test(f));
  const primaryButton = buttons.find(b => /login|sign in|submit|continue|search|add|buy|checkout/i.test(b)) || buttons[0];
  const firstField = fields.find(f => /user|email|username|name/i.test(f)) || fields[0];
  const secondField = fields.find(f => /password|pass/i.test(f)) || fields[1];

  const navStep = pageUrl
    ? { step_number: 1, keyword: "Given", action: `navigate to ${pageUrl}` }
    : { step_number: 1, keyword: "Given", action: `the user is on the ${feature} page` };

  const tests: GeneratedTest[] = [];

  // Happy path
  const happySteps: Step[] = [navStep];
  if (hasLoginForm && firstField && secondField) {
    happySteps.push({ step_number: 2, keyword: "When", action: `type 'standard_user' into the ${firstField} field` });
    happySteps.push({ step_number: 3, keyword: "And", action: `type 'secret_sauce' into the ${secondField} field` });
    if (primaryButton) happySteps.push({ step_number: 4, keyword: "And", action: `click the ${primaryButton} button` });
    happySteps.push({ step_number: happySteps.length + 1, keyword: "Then", action: `see the URL changes away from the login page`, expected_result: "User is redirected to the main page" });
  } else if (firstField && primaryButton) {
    happySteps.push({ step_number: 2, keyword: "When", action: `type 'test@example.com' into the ${firstField} field` });
    happySteps.push({ step_number: 3, keyword: "And", action: `click the ${primaryButton} button` });
    happySteps.push({ step_number: 4, keyword: "Then", action: `see a success message on the page`, expected_result: "Success state is shown" });
  } else if (primaryButton) {
    happySteps.push({ step_number: 2, keyword: "When", action: `click the ${primaryButton} button` });
    happySteps.push({ step_number: 3, keyword: "Then", action: `see the page content updates`, expected_result: "Expected content is visible" });
  } else {
    happySteps.push({ step_number: 2, keyword: "When", action: `the page is fully loaded` });
    happySteps.push({ step_number: 3, keyword: "Then", action: `see the page title contains "${feature}"`, expected_result: "Page loads correctly" });
  }
  tests.push(makeTest(requirement, testType, `${title} — happy path`, "happy_path", happySteps));

  // Negative path
  const negSteps: Step[] = [navStep];
  if (hasLoginForm && firstField && secondField) {
    negSteps.push({ step_number: 2, keyword: "When", action: `type 'locked_out_user' into the ${firstField} field` });
    negSteps.push({ step_number: 3, keyword: "And", action: `type 'secret_sauce' into the ${secondField} field` });
    if (primaryButton) negSteps.push({ step_number: 4, keyword: "And", action: `click the ${primaryButton} button` });
    negSteps.push({ step_number: negSteps.length + 1, keyword: "Then", action: `see an error message on the page`, expected_result: "Error message is visible" });
  } else if (firstField && primaryButton) {
    negSteps.push({ step_number: 2, keyword: "When", action: `type '' into the ${firstField} field` });
    if (primaryButton) negSteps.push({ step_number: 3, keyword: "And", action: `click the ${primaryButton} button` });
    negSteps.push({ step_number: negSteps.length + 1, keyword: "Then", action: `see a validation error message on the page`, expected_result: "Error message is visible" });
  } else {
    negSteps.push({ step_number: 2, keyword: "When", action: `the user submits the page with no input` });
    negSteps.push({ step_number: 3, keyword: "Then", action: `see an error or validation message on the page`, expected_result: "Error message is visible" });
  }
  tests.push(makeTest(requirement, testType, `${title} — invalid input`, "negative", negSteps));

  // Boundary
  const boundarySteps: Step[] = [navStep];
  if (firstField) {
    boundarySteps.push({ step_number: 2, keyword: "When", action: `type a very long string of 500 characters into the ${firstField} field` });
    if (primaryButton) boundarySteps.push({ step_number: 3, keyword: "And", action: `click the ${primaryButton} button` });
    boundarySteps.push({ step_number: boundarySteps.length + 1, keyword: "Then", action: `see the field handles the long input without crashing`, expected_result: "No crash or data loss" });
  } else if (limit) {
    boundarySteps.push({ step_number: 2, keyword: "When", action: `the user exercises the ${feature} at the ${limit[1]} ${limit[2]} limit` });
    boundarySteps.push({ step_number: 3, keyword: "Then", action: `see the ${feature} behaves as specified at that limit`, expected_result: `Limit of ${limit[1]} ${limit[2]} is honored` });
  } else {
    boundarySteps.push({ step_number: 2, keyword: "When", action: `the page is loaded with slow network conditions` });
    boundarySteps.push({ step_number: 3, keyword: "Then", action: `see the page loads without errors`, expected_result: "No crash or data loss" });
  }
  tests.push(makeTest(requirement, testType, `${title} — boundary`, "boundary", boundarySteps));

  return tests;
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

    if (!project_id || !requirement_ids || !Array.isArray(requirement_ids) || requirement_ids.length === 0) {
      return new Response(JSON.stringify({ error: "project_id and requirement_ids[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("test_type")
      .eq("id", project_id)
      .maybeSingle();
    const testType = project?.test_type || "ui";

    const { data: requirements, error: reqError } = await supabase
      .from("requirements")
      .select("*")
      .in("id", requirement_ids);

    if (reqError) throw reqError;
    if (!requirements || requirements.length === 0) {
      return new Response(JSON.stringify({ error: "No requirements found for the given ids" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = await getAIConfig(supabase);
    const allGenerated: GeneratedTest[] = [];
    let usedAI = false;

    for (const req of requirements as Requirement[]) {
      let tests: GeneratedTest[];
      try {
        if (cfg.apiKey) {
          tests = await generateWithAI(req, testType, cfg);
          usedAI = true;
        } else {
          throw new Error("No API key configured");
        }
      } catch {
        tests = generateRuleBased(req, testType);
      }
      allGenerated.push(...tests.map(t => ({ ...t, project_id })));
    }

    const { data: inserted, error: insertError } = await supabase
      .from("test_cases")
      .insert(allGenerated)
      .select();

    if (insertError) throw insertError;

    for (const req of requirements as Requirement[]) {
      await supabase.from("requirements").update({ has_coverage: true }).eq("id", req.id);
    }

    return new Response(JSON.stringify({
      generated: inserted?.length || 0,
      test_cases: inserted,
      method: usedAI ? "ai" : "rule-based",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
