import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

function ruleBasedHeal(testCase: any, runResults: any[]) {
  const errorText = (runResults || []).filter(r => r.status === "fail").map(r => r.error_log).filter(Boolean).join(" | ");
  const timeout = /timeout|timed out|exceeded/i.test(errorText);
  const missing = /not found|unable to locate|no such element|selector/i.test(errorText);
  const assertion = /assert|expected|mismatch/i.test(errorText);

  let diagnosis = "Data Dependency";
  let explanation = "Failures are intermittent without a clear error, which often points to shared or changing test data.";
  let newGherkin = testCase.gherkin;
  let reason = "Rule-based fallback (no AI key configured)";

  if (timeout) {
    diagnosis = "Timing Issue";
    explanation = "Failures mention timeouts. The assertion is likely correct but the wait is too short for the environment.";
    newGherkin = injectWaitStep(testCase.gherkin);
    reason = "Added an explicit wait step to reduce timing flakiness";
  } else if (missing) {
    diagnosis = "Stale Selector";
    explanation = "Failures mention missing elements, which usually means the page changed and the test references an outdated element.";
    newGherkin = relaxSelector(testCase.gherkin);
    reason = "Relaxed element references to be more tolerant of page changes";
  } else if (assertion) {
    diagnosis = "Assertion Too Strict";
    explanation = "Failures are assertion mismatches. The expected result may be too strict or out of date.";
    newGherkin = relaxAssertions(testCase.gherkin);
    reason = "Softened assertions to accept equivalent outcomes";
  }

  return { diagnosis, explanation, confidence: 60, new_gherkin: newGherkin, reason };
}

function injectWaitStep(gherkin: string): string {
  if (/wait/i.test(gherkin)) return gherkin;
  const lines = gherkin.split("\n");
  const thenIdx = lines.findIndex(l => /^\s*(Then|And)\b/i.test(l));
  if (thenIdx > 0) {
    lines.splice(thenIdx, 0, "    And the page has finished loading");
  } else {
    lines.push("    And the page has finished loading");
  }
  return lines.join("\n");
}

function relaxSelector(gherkin: string): string {
  return gherkin.replace(/(?:click|tap|press|select)\s+(?:on\s+)?["']?([^"']+?)["']?\s+(?:button|link|element)/gi, (m, name) => {
    return `click on the ${name} element if it is visible`;
  });
}

function relaxAssertions(gherkin: string): string {
  return gherkin.replace(/(?:the|a)\s+(?:page|screen|system|app)\s+(shows|displays|contains)\s+(.+)/gi, "the expected result is shown");
}

function extractJsonObject(content: string): any {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in AI response");
  return JSON.parse(match[0]);
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

    const { test_case_id } = await req.json();

    if (!test_case_id) {
      return new Response(JSON.stringify({ error: "test_case_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: testCase, error: tcError } = await supabase
      .from("test_cases")
      .select("*")
      .eq("id", test_case_id)
      .maybeSingle();

    if (tcError) throw tcError;
    if (!testCase) throw new Error("Test case not found");

    const { data: runResults } = await supabase
      .from("test_run_results")
      .select("status, error_log, created_at")
      .eq("test_case_id", test_case_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: requirements } = await supabase
      .from("requirements")
      .select("req_id, title, description")
      .in("id", testCase.source_req_ids || []);

    const cfg = await getAIConfig(supabase);

    let proposal: any;
    let method = "ai";

    if (cfg.apiKey) {
      const reqText = (requirements || []).map(r => `${r.req_id}: ${r.title} — ${r.description}`).join("\n") || "No linked requirements";
      const runsText = (runResults || []).map(r => `${r.status}${r.error_log ? ` — ${r.error_log}` : ""}`).join("\n") || "No run history";

      const prompt = `You are a QA test-healing agent. A test has become flaky: it passes and fails intermittently. Diagnose the root cause and propose a corrected Gherkin.

Test case:
Title: ${testCase.title}
Gherkin:
${testCase.gherkin}

Recent runs (newest first):
${runsText}

Linked requirements:
${reqText}

Return ONLY valid JSON with exactly these keys:
- "diagnosis": one of "Timing Issue", "Stale Selector", "Data Dependency", "Environment Flake", "Assertion Too Strict", "Other"
- "explanation": 1-3 sentences a human can understand
- "confidence": integer 0-100
- "new_gherkin": the corrected full Gherkin (Feature + Scenario). Keep the same intent; only change what is needed to stop the flakiness. If no change is needed, return the original.
- "reason": short reason for the change (for version history)`;

      const url = cfg.baseUrl.endsWith("/") ? cfg.baseUrl : cfg.baseUrl + "/";
      proposal = null;

      for (let attempt = 0; attempt < 2 && !proposal; attempt++) {
        try {
          const resp = await fetch(url + "v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: prompt }], temperature: attempt === 0 ? 0.2 : 0.5, max_tokens: 1500 }),
          });
          if (!resp.ok) throw new Error(`AI API error: ${resp.status}`);
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content || "";
          proposal = extractJsonObject(content);
        } catch {
          // fall through to retry or rule-based fallback
        }
      }

      if (!proposal) {
        proposal = ruleBasedHeal(testCase, runResults || []);
        method = "rule-based";
      }
    } else {
      proposal = ruleBasedHeal(testCase, runResults || []);
      method = "rule-based";
    }

    return new Response(JSON.stringify({
      test_case_id,
      method,
      diagnosis: proposal.diagnosis || "Other",
      explanation: proposal.explanation || "",
      confidence: typeof proposal.confidence === "number" ? proposal.confidence : 60,
      new_gherkin: proposal.new_gherkin || testCase.gherkin,
      reason: proposal.reason || "AI auto-heal proposal",
      current_gherkin: testCase.gherkin,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
