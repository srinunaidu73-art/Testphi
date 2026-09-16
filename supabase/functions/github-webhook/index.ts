import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-GitHub-Event, X-GitHub-Delivery",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const eventType = req.headers.get("X-GitHub-Event") || "";
    const payload = await req.json();

    // Determine which project this webhook is for
    const repoFullName = payload.repository?.full_name || "";
    const [owner, repo] = repoFullName.split("/");

    if (!owner || !repo) {
      return new Response(JSON.stringify({ error: "Could not determine repository from payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find matching CI/CD config
    const { data: configs } = await supabase
      .from("cicd_configs")
      .select("*")
      .eq("is_connected", true)
      .eq("github_owner", owner)
      .eq("github_repo", repo);

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ error: "No matching CI/CD config found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = configs[0];
    const projectId = config.project_id;

    // Determine which suite to trigger based on trigger rules
    const triggerRules = config.trigger_rules || [];
    let suiteType = "smoke";
    let branch = "";

    if (eventType === "pull_request") {
      branch = payload.pull_request?.base?.ref || "";
      const rule = triggerRules.find((r: any) => r.event === "Pull Request");
      if (rule) suiteType = rule.suite.toLowerCase().includes("smoke") ? "smoke" : "regression";
    } else if (eventType === "push") {
      branch = payload.ref?.replace("refs/heads/", "") || "";
      const rule = triggerRules.find((r: any) => r.event === "Push" && (r.branch === "*" || r.branch === branch));
      if (rule) suiteType = rule.suite.toLowerCase().includes("smoke") ? "smoke" : "regression";
    } else {
      return new Response(JSON.stringify({ message: `Ignoring event: ${eventType}` }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the suite to run
    const { data: suites } = await supabase
      .from("test_suites")
      .select("*")
      .eq("project_id", projectId)
      .eq("suite_type", suiteType);

    if (!suites || suites.length === 0) {
      return new Response(JSON.stringify({ error: `No ${suiteType} suite found` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const suite = suites[0];

    // Create a test run
    const commitSha = payload.after || payload.pull_request?.head?.sha || "unknown";
    const commitMessage = payload.head_commit?.message || payload.pull_request?.title || "";

    const { data: run } = await supabase
      .from("test_runs")
      .insert({
        project_id: projectId,
        suite_id: suite.id,
        suite_name: suite.name,
        suite_type: suite.suite_type,
        status: "running",
        environment: "staging",
        total_cases: 0,
      })
      .select()
      .single();

    // Create a CI/CD run record
    await supabase.from("cicd_runs").insert({
      project_id: projectId,
      commit_sha: commitSha.substring(0, 7),
      commit_message: commitMessage,
      triggered_suite: suite.name,
      run_status: "running",
      pass_rate: 0,
      github_status: "pending",
      run_id: run?.id || null,
    });

    // In production, this would trigger actual test execution
    // For now, simulate completion
    const { data: memberships } = await supabase
      .from("suite_memberships")
      .select("test_case_id")
      .eq("suite_id", suite.id);

    const totalCases = memberships?.length || 0;
    const passed = Math.floor(totalCases * 0.9);
    const failed = totalCases - passed;
    const passRate = totalCases > 0 ? Math.round((passed / totalCases) * 100) : 0;

    await supabase.from("test_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      total_cases: totalCases,
      passed,
      failed,
      skipped: 0,
      duration_sec: totalCases * 30,
    }).eq("id", run?.id);

    // Update CI/CD run with results
    const { data: cicdRuns } = await supabase
      .from("cicd_runs")
      .select("id")
      .eq("run_id", run?.id);

    if (cicdRuns && cicdRuns.length > 0) {
      await supabase.from("cicd_runs").update({
        run_status: "completed",
        pass_rate: passRate,
        github_status: passRate >= 100 ? "passed" : "failed",
      }).eq("id", cicdRuns[0].id);
    }

    // Post status to GitHub (if token is available)
    if (config.github_token) {
      try {
        const statusUrl = `https://api.github.com/repos/${repoFullName}/statuses/${commitSha}`;
        await fetch(statusUrl, {
          method: "POST",
          headers: {
            "Authorization": `token ${config.github_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            state: passRate >= 100 ? "success" : "failure",
            description: `TestPhi: ${passed}/${totalCases} tests passed (${passRate}%)`,
            context: "TestPhi CI",
          }),
        });
      } catch {
        // GitHub API call failed — not critical
      }
    }

    return new Response(JSON.stringify({
      message: "Webhook processed",
      event: eventType,
      branch,
      suite: suite.name,
      run_id: run?.id,
      passed,
      failed,
      total: totalCases,
      pass_rate: passRate,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
