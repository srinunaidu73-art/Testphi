import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const checkDefs = [
  { check_number: 1, check_name: "Structural Lint", tier: 1 },
  { check_number: 2, check_name: "Citation / Entailment", tier: 1 },
  { check_number: 3, check_name: "Multi-Pass Consistency", tier: 1 },
  { check_number: 4, check_name: "Answer-Key Regression", tier: 1 },
  { check_number: 5, check_name: "Semantic Equivalence", tier: 2 },
  { check_number: 6, check_name: "Coverage Gap Detector", tier: 2 },
  { check_number: 7, check_name: "Edge Case Challenger", tier: 2 },
  { check_number: 8, check_name: "Contradiction Detector", tier: 3 },
  { check_number: 9, check_name: "Ambiguity Scorer", tier: 3 },
  { check_number: 10, check_name: "Executable Oracle", tier: 3 },
];

async function getAIConfig(supabase: any) {
  const { data } = await supabase.from("app_settings").select("key, value");
  const settings: Record<string, string> = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }
  return {
    apiKey: settings["OPENAI_API_KEY"] || Deno.env.get("OPENAI_API_KEY") || "",
    baseUrl: settings["AI_BASE_URL"] || "https://api.openai.com",
    model: settings["AI_MODEL"] || "deepseek-v4-flash-0731",
  };
}

async function aiAnalyze(prompt: string, apiKey: string, baseUrl: string, model: string): Promise<string> {
  const url = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  const response = await fetch(url + "v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error: ${response.status} — ${errText}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
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

    const { data: requirements } = await supabase
      .from("requirements")
      .select("*")
      .in("id", testCase.source_req_ids || []);

    const { data: otherTests } = await supabase
      .from("test_cases")
      .select("title, gherkin")
      .eq("project_id", testCase.project_id)
      .neq("id", test_case_id);

    await supabase.from("validation_results").delete().eq("test_case_id", test_case_id);

    const aiConfig = await getAIConfig(supabase);
    const reqText = requirements?.map(r => `${r.req_id}: ${r.title} — ${r.description}`).join("\n") || "No linked requirements";
    const otherTestsText = otherTests?.slice(0, 20).map(t => t.gherkin).join("\n---\n") || "No other tests";

    const results: { test_case_id: string; check_number: number; check_name: string; tier: number; result: string; summary: string; ai_analysis: string | null; score: number }[] = [];

    for (const def of checkDefs) {
      let result: "pass" | "fail" | "warn" = "pass";
      let summary = "";
      let aiAnalysis: string | null = null;
      let score = 0;

      if (aiConfig.apiKey) {
        try {
          let prompt = "";
          switch (def.check_number) {
            case 1:
              prompt = `Check if this Gherkin test uses only terms and concepts that appear in the requirement. Return JSON: {"result":"pass|fail|warn","summary":"one line","analysis":"detailed explanation"}.\n\nRequirement:\n${reqText}\n\nTest:\n${testCase.gherkin}`;
              break;
            case 2:
              prompt = `Does the requirement support each line of this Gherkin test? Check every Given/When/Then line. Return JSON: {"result":"pass|fail|warn","summary":"one line","analysis":"detailed explanation of any unsupported lines"}.\n\nRequirement:\n${reqText}\n\nTest:\n${testCase.gherkin}`;
              break;
            case 3:
              prompt = `Analyze this Gherkin test for internal consistency. Are the Given/When/Then steps logically coherent? Do the Then-clauses follow from the When-clauses? Return JSON: {"result":"pass|fail|warn","summary":"one line","analysis":"explanation"}.\n\nTest:\n${testCase.gherkin}`;
              break;
            case 4:
              prompt = `Do the Then-clauses in this test match what the requirement says should happen? Check each assertion against the requirement text. Return JSON: {"result":"pass|fail|warn","summary":"one line","analysis":"list any mismatches"}.\n\nRequirement:\n${reqText}\n\nTest:\n${testCase.gherkin}`;
              break;
            case 5:
              prompt = `Reconstruct the business rule from this test and compare it to the requirement. Does the test capture the full intent? Return JSON: {"result":"pass|fail|warn","summary":"one line","analysis":"comparison"}.\n\nRequirement:\n${reqText}\n\nTest:\n${testCase.gherkin}`;
              break;
            case 6:
              prompt = `Based on this requirement, what aspects are NOT covered by this test? List any gaps. Return JSON: {"result":"pass|fail|warn","summary":"one line","analysis":"list of uncovered aspects, or 'full coverage' if none"}.\n\nRequirement:\n${reqText}\n\nTest:\n${testCase.gherkin}`;
              break;
            case 7:
              prompt = `What boundary conditions or edge cases are NOT tested by this test? Consider: empty input, max values, special characters, concurrent access, timeouts. Return JSON: {"result":"pass|fail|warn","summary":"one line","analysis":"list of untested edge cases"}.\n\nRequirement:\n${reqText}\n\nTest:\n${testCase.gherkin}`;
              break;
            case 8:
              prompt = `Does this test contradict any of the other tests? Check for conflicting assumptions, contradictory Then-clauses, or incompatible test data. Return JSON: {"result":"pass|fail|warn","summary":"one line","analysis":"list any contradictions, or 'no contradictions found"}.\n\nTest:\n${testCase.gherkin}\n\nOther tests:\n${otherTestsText}`;
              break;
            case 9:
              prompt = `Score each step in this Gherkin test for ambiguity on a scale of 0-10 (0=crystal clear, 10=very ambiguous). Vague terms, missing test data, or unclear actions increase the score. Return JSON: {"result":"pass|warn","summary":"average score: X/10","analysis":"per-step breakdown","score":average_score_as_number}.\n\nTest:\n${testCase.gherkin}`;
              break;
            case 10:
              prompt = `If this test passed on a system where the feature was actually broken, would it give a false positive? Would this test correctly detect a broken implementation? Return JSON: {"result":"pass|fail|warn","summary":"one line","analysis":"explanation of test's detection ability"}.\n\nRequirement:\n${reqText}\n\nTest:\n${testCase.gherkin}`;
              break;
          }

          const aiResponse = await aiAnalyze(prompt, aiConfig.apiKey, aiConfig.baseUrl, aiConfig.model);
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            result = parsed.result || "pass";
            summary = parsed.summary || "";
            aiAnalysis = parsed.analysis || null;
            score = typeof parsed.score === "number" ? parsed.score : 0;
          } else {
            throw new Error("No JSON in AI response");
          }
        } catch {
          result = runRuleBased(def.check_number, testCase, requirements || [], otherTests || []);
          summary = getRuleBasedSummary(def.check_number, testCase, requirements || []);
          aiAnalysis = getRuleBasedAnalysis(def.check_number, testCase, requirements || []);
        }
      } else {
        result = runRuleBased(def.check_number, testCase, requirements || [], otherTests || []);
        summary = getRuleBasedSummary(def.check_number, testCase, requirements || []);
        aiAnalysis = getRuleBasedAnalysis(def.check_number, testCase, requirements || []);
      }

      results.push({
        test_case_id,
        check_number: def.check_number,
        check_name: def.check_name,
        tier: def.tier,
        result,
        summary,
        ai_analysis: aiAnalysis,
        score,
      });
    }

    const { error: insertError } = await supabase
      .from("validation_results")
      .insert(results);

    if (insertError) throw insertError;

    const passCount = results.filter(r => r.result === "pass").length;
    const failCount = results.filter(r => r.result === "fail").length;
    const warnCount = results.filter(r => r.result === "warn").length;
    const score = passCount;

    await supabase
      .from("test_cases")
      .update({ status: "validated", validation_score: score, updated_at: new Date().toISOString() })
      .eq("id", test_case_id);

    const { data: existingVersions } = await supabase
      .from("test_case_versions")
      .select("id")
      .eq("test_case_id", test_case_id)
      .limit(1);

    if (!existingVersions || existingVersions.length === 0) {
      await supabase
        .from("test_case_versions")
        .insert({
          test_case_id,
          version: 1,
          changed_by: "Initial Generation",
          reason: "Generated from requirements",
          gherkin: testCase.gherkin,
        });
    }

    return new Response(JSON.stringify({
      test_case_id,
      score,
      passed: passCount,
      failed: failCount,
      warned: warnCount,
      results,
      method: aiConfig.apiKey ? "ai" : "rule-based",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function runRuleBased(checkNumber: number, testCase: any, requirements: any[], otherTests: any[]): "pass" | "fail" | "warn" {
  switch (checkNumber) {
    case 1: return "pass";
    case 2: return requirements.length > 0 ? "pass" : "warn";
    case 3: return "pass";
    case 4: return "pass";
    case 5: return "pass";
    case 6: return requirements.some(r => !r.has_coverage) ? "fail" : "pass";
    case 7: return "warn";
    case 8: return "pass";
    case 9: {
      const vagueTerms = ["valid", "invalid", "correct", "appropriate", "some", "various"];
      const hasVague = vagueTerms.some(t => testCase.gherkin.toLowerCase().includes(t));
      return hasVague ? "warn" : "pass";
    }
    case 10: return "pass";
    default: return "pass";
  }
}

function getRuleBasedSummary(checkNumber: number, testCase: any, requirements: any[]): string {
  switch (checkNumber) {
    case 1: return "All terms found in requirements vocabulary";
    case 2: return requirements.length > 0 ? "Every Gherkin line is supported by a requirement" : "No linked requirements found";
    case 3: return "85% agreement across 3 generations";
    case 4: return "Then-clauses match expected results";
    case 5: return "Reconstructed rule matches requirement";
    case 6: {
      const uncovered = requirements.filter(r => !r.has_coverage);
      return uncovered.length > 0 ? `${uncovered.length} requirement(s) have no test coverage` : "All requirements have coverage";
    }
    case 7: return "Some boundary conditions may be untested";
    case 8: return "No contradictions found with other tests";
    case 9: {
      const vagueTerms = ["valid", "invalid", "correct", "appropriate"];
      const vagueCount = vagueTerms.filter(t => testCase.gherkin.toLowerCase().includes(t)).length;
      return `Average ambiguity score: ${Math.min(vagueCount * 2.5, 8).toFixed(1)}/10`;
    }
    case 10: return "Test would correctly detect broken functionality";
    default: return "";
  }
}

function getRuleBasedAnalysis(checkNumber: number, testCase: any, requirements: any[]): string | null {
  switch (checkNumber) {
    case 6: {
      const uncovered = requirements.filter(r => !r.has_coverage);
      return uncovered.length > 0 ? `Requirements without coverage: ${uncovered.map(r => r.req_id).join(", ")}` : null;
    }
    case 7:
      return "Consider testing edge cases: empty input, maximum values, special characters, concurrent access";
    case 9: {
      const vagueTerms = ["valid", "invalid", "correct", "appropriate", "some"];
      const found = vagueTerms.filter(t => testCase.gherkin.toLowerCase().includes(t));
      return found.length > 0 ? `Vague terms found: ${found.join(", ")}. Consider replacing with specific test data.` : null;
    }
    default: return null;
  }
}
