// run-tests v4 — page.type/page.click for SPA compatibility
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Step {
  step_number?: number;
  keyword?: string;
  action?: string;
  expected_result?: string;
}

async function getBrowserlessConfig(supabase: any) {
  const { data } = await supabase.from("app_settings").select("key, value");
  const settings: Record<string, string> = {};
  for (const row of data || []) settings[row.key] = row.value;
  return {
    token: settings["BROWSERLESS_API_KEY"] || Deno.env.get("BROWSERLESS_API_KEY") || "",
    baseUrl: (settings["BROWSERLESS_BASE_URL"] || "https://chrome.browserless.io").replace(/\/+$/, ""),
  };
}

// This account's Browserless plan serves Chromium-family browsers over the
// /function REST endpoint. Firefox and WebKit are not provisioned and 404.
const BROWSER_ENDPOINTS: Record<string, string> = {
  chromium: "/chromium/function",
  chrome: "/chrome/function",
  edge: "/edge/function",
  firefox: "/firefox/function",
  webkit: "/webkit/function",
};

const BROWSER_LABELS: Record<string, string> = {
  chromium: "Chrome",
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  webkit: "Safari",
};

function extractTarget(action: string): string {
  const m = action.match(/(?:click|tap|press|select|see|visible|display|show|contain)\s+(?:on\s+|the\s+)?["']?([^"']{2,60}?)(?:\s+(?:button|link|text|element|field|input|page|screen|option))?["']?\s*$/i);
  return m ? m[1].replace(/^(the|a|an)\s+/i, "").trim() : "";
}

function cleanFieldName(field: string): string {
  return field
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\b(field|input|textbox|box|area|dropdown|select|element)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Browser action translator — v4: find selector via evaluate, interact via page.type/page.click
function actionToPuppeteer(action: string): string {
  const a = action.toLowerCase();

  const urlMatch = action.match(/https?:\/\/[^\s"']+/i);
  if (urlMatch && /\b(visit|navigate|go to|open|on)\b/.test(a)) {
    return `await page.goto(${JSON.stringify(urlMatch[0])}, { waitUntil: 'domcontentloaded', timeout: 30000 });`;
  }

  // URL verification: "see the URL contains 'inventory.html'"
  const urlContainsMatch = action.match(/(?:see|verify|check)\s+(?:the\s+)?(?:url|page url|browser url)\s+contains\s+["']?([^"']+?)["']?\s*$/i);
  if (urlContainsMatch) {
    const fragment = urlContainsMatch[1].trim();
    return `await page.evaluate((frag) => { if (!window.location.href.includes(frag)) throw new Error('Expected URL to contain: ' + frag + ' but was: ' + window.location.href); }, ${JSON.stringify(fragment)});`;
  }

  // Text verification: "see 'Products' on the page" or "see Products on the page"
  const seeQuotedMatch = action.match(/(?:see|verify|check)\s+["']([^"']{2,200})["']\s*(?:on|in)\s+(?:the\s+)?(?:page|screen|site)?\s*$/i);
  if (seeQuotedMatch) {
    const text = seeQuotedMatch[1].trim();
    return `await page.evaluate((t) => { if (!(document.body.innerText || '').toLowerCase().includes(t.toLowerCase())) throw new Error(${JSON.stringify("Expected to see: " + text)}); }, ${JSON.stringify(text)});`;
  }

  const seeUnquotedMatch = action.match(/(?:see|verify|check)\s+(.{2,200}?)\s+(?:on|in)\s+(?:the\s+)?(?:page|screen|site)\s*$/i);
  if (seeUnquotedMatch) {
    const text = seeUnquotedMatch[1].trim();
    return `await page.evaluate((t) => { if (!(document.body.innerText || '').toLowerCase().includes(t.toLowerCase())) throw new Error(${JSON.stringify("Expected to see: " + text)}); }, ${JSON.stringify(text)});`;
  }

  // Bare "see <text>" without "on the page" suffix
  if (/\b(see|verify|check)\b/.test(a) && !urlContainsMatch) {
    const target = extractTarget(action);
    if (target) {
      return `await page.evaluate((t) => { if (!(document.body.innerText || '').toLowerCase().includes(t.toLowerCase())) throw new Error(${JSON.stringify("Expected to see: " + target)}); }, ${JSON.stringify(target)});`;
    }
  }

  if (/\b(click|tap|press|select)\b/.test(a)) {
    const target = extractTarget(action);
    if (target) {
      return `{
  const sel = await page.evaluate((t) => {
    const els = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]'));
    const tl = t.toLowerCase();
    const el = els.find((e) => (((e.textContent || '') + ' ' + (e.value || '') + ' ' + (e.getAttribute('aria-label') || '') + ' ' + (e.id || '')).toLowerCase().includes(tl)));
    if (!el) throw new Error(${JSON.stringify("Could not find clickable element: " + target)});
    if (el.id) return '#' + CSS.escape(el.id);
    return null;
  }, ${JSON.stringify(target)});
  if (!sel) throw new Error(${JSON.stringify("Could not find clickable element (no id): " + target)});
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
    page.click(sel),
  ]);
}`;
    }
  }

  const fillMatch = action.match(/(?:type|enter|input|fill)\s+["']?([^"']+?)["']?\s+(?:into|in)\s+["']?(.+?)["']?\s*$/i);
  if (fillMatch) {
    const value = fillMatch[1].trim();
    const rawField = fillMatch[2].trim();
    const field = cleanFieldName(rawField);
    return `{
  const sel = await page.evaluate((f) => {
    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
    const words = f.split(/[^a-z0-9]+/).filter(w => w.length > 1);
    const input = inputs.find((i) => {
      const labels = i.labels ? Array.from(i.labels).map((l) => l.textContent).join(' ') : '';
      const hay = ((i.getAttribute('placeholder') || '') + ' ' + (i.getAttribute('name') || '') + ' ' + (i.getAttribute('id') || '') + ' ' + (i.getAttribute('aria-label') || '') + ' ' + labels).toLowerCase();
      if (hay.includes(f)) return true;
      const hayWords = hay.split(/[^a-z0-9]+/).filter(w => w.length > 0);
      if (words.every(w => hayWords.some(hw => hw === w || hw.includes(w) || w.includes(hw)))) return true;
      return false;
    });
    if (!input) throw new Error(${JSON.stringify("Could not find field: " + rawField)});
    if (input.id) return '#' + CSS.escape(input.id);
    if (input.name) return '[name="' + input.name + '"]';
    return null;
  }, ${JSON.stringify(field)});
  if (!sel) throw new Error(${JSON.stringify("Could not find field (no id/name): " + rawField)});
  await page.type(sel, ${JSON.stringify(value)});
}`;
  }

  return "";
}

function stepsToPuppeteer(steps: Step[], baseUrl: string): string {
  const lines: string[] = [
    `await page.goto(${JSON.stringify(baseUrl)}, { waitUntil: 'domcontentloaded', timeout: 30000 });`,
    `await page.waitForSelector('input, button, a, [role="button"]', { timeout: 15000 }).catch(() => {});`,
  ];
  for (const step of steps) {
    const action = (step.action || "").trim();
    if (!action) continue;
    const code = actionToPuppeteer(action);
    if (code) lines.push(code);
  }
  return lines.join("\n");
}

// A test is only executable if at least one step translates into a real
// browser action (navigate/click/type/verify). Vague AI-generated prose like
// "the user performs the main action" translates to nothing; running it would
// just load the page and report a fake pass.
function hasExecutableSteps(steps: Step[]): boolean {
  for (const step of steps) {
    const action = (step.action || "").trim();
    if (action && actionToPuppeteer(action)) return true;
  }
  return false;
}

function loginToPuppeteer(cred: {
  login_url: string;
  username: string;
  password: string;
  username_selector: string;
  password_selector: string;
  submit_selector: string;
}): string {
  const usernameSel = cred.username_selector || "input[type=email], input[type=text], input[name*=user], input[name*=email], input[id*=user], input[id*=email]";
  const passwordSel = cred.password_selector || "input[type=password]";
  const submitSel = cred.submit_selector || "button[type=submit], input[type=submit], button";

  const lines: string[] = [
    `await page.goto(${JSON.stringify(cred.login_url)}, { waitUntil: 'domcontentloaded', timeout: 30000 });`,
    `await page.waitForSelector(${JSON.stringify(usernameSel)}, { timeout: 15000 });`,
    `await page.type(${JSON.stringify(usernameSel)}, ${JSON.stringify(cred.username)});`,
    `await page.type(${JSON.stringify(passwordSel)}, ${JSON.stringify(cred.password)});`,
    `await page.click(${JSON.stringify(submitSel)});`,
    `await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});`,
  ];
  return lines.join("\n");
}

function buildScript(steps: Step[], baseUrl: string, captureScreenshot: boolean, cred?: {
  login_url: string;
  username: string;
  password: string;
  username_selector: string;
  password_selector: string;
  submit_selector: string;
} | null): string {
  const body = (cred ? loginToPuppeteer(cred) + "\n" : "") + stepsToPuppeteer(steps, baseUrl);
  const shot = captureScreenshot
    ? `const shot = await page.screenshot({ type: 'jpeg', quality: 50, encoding: 'base64' }).catch(() => null);`
    : `const shot = null;`;
  return `export default async ({ page, context }) => {
  const started = Date.now();
  try {
    ${body}
    ${shot}
    return { data: { status: 'pass', message: 'All steps passed', duration_ms: Date.now() - started, screenshot: shot || null }, type: 'application/json' };
  } catch (err) {
    ${shot}
    return { data: { status: 'fail', message: err.message || String(err), duration_ms: Date.now() - started, screenshot: shot || null }, type: 'application/json' };
  }
};`;
}

async function skipResult(supabase: any, run_id: string, test_case_id: string, testCase: any, reason: string) {
  await supabase.from("test_run_results").insert({
    run_id,
    test_case_id,
    test_case_title: testCase.title,
    status: "skip",
    duration_ms: 0,
    error_log: reason,
    screenshot_url: "",
    browser: "chromium",
  });
  await supabase.from("test_cases").update({
    last_run_status: "skip",
    updated_at: new Date().toISOString(),
  }).eq("id", test_case_id);
  return new Response(JSON.stringify({
    test_case_id,
    title: testCase.title,
    status: "skip",
    duration_ms: 0,
    error: reason,
    screenshot: "",
    browser: "chromium",
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    const { run_id, test_case_id, environment_url, capture_screenshot, browser } = await req.json();

    if (!run_id || !test_case_id) {
      return new Response(JSON.stringify({ error: "run_id and test_case_id required" }), {
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

    let baseUrl = environment_url;
    let runEnv = "";
    if (!baseUrl) {
      const { data: run } = await supabase.from("test_runs").select("project_id, environment").eq("id", run_id).maybeSingle();
      if (run) {
        runEnv = run.environment;
        const { data: env } = await supabase
          .from("environments")
          .select("url")
          .eq("project_id", run.project_id)
          .eq("name", run.environment)
          .maybeSingle();
        baseUrl = env?.url || "";
      }
    }

    const steps: Step[] = Array.isArray(testCase.steps) ? testCase.steps : [];

    // Honest skip results instead of fake passes when the run cannot be real.
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
      return skipResult(supabase, run_id, test_case_id, testCase,
        `Environment URL is not configured${runEnv ? ` for "${runEnv}"` : ""}. Set the website URL in Settings > Environment URLs, then run again.`);
    }
    if (!hasExecutableSteps(steps)) {
      return skipResult(supabase, run_id, test_case_id, testCase,
        "No executable steps. The generated steps are too vague to automate (they name no page, button, link, or field to interact with). Regenerate the test with more concrete steps, e.g. \"click the login button\" or \"type test@example.com into the email field\".");
    }

    const cfg = await getBrowserlessConfig(supabase);
    if (!cfg.token) {
      return new Response(JSON.stringify({
        error: "No browser key configured. Add a Browserless API key in Settings to run tests.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const browserName = typeof browser === "string" && BROWSER_ENDPOINTS[browser] ? browser : "chromium";

    let cred: {
      login_url: string;
      username: string;
      password: string;
      username_selector: string;
      password_selector: string;
      submit_selector: string;
    } | null = null;
    if (run_id) {
      const { data: runRow } = await supabase.from("test_runs").select("project_id, environment").eq("id", run_id).maybeSingle();
      if (runRow) {
        const { data: credRow } = await supabase
          .from("credentials")
          .select("login_url, username, password, username_selector, password_selector, submit_selector")
          .eq("project_id", runRow.project_id)
          .eq("environment", runRow.environment)
          .maybeSingle();
        if (credRow && credRow.username && credRow.password) cred = credRow;
      }
    }

    const script = buildScript(steps, baseUrl, !!capture_screenshot, cred);

    const started = Date.now();
    let status = "fail";
    let message = "";
    let screenshot: string | null = null;

    try {
      const endpoint = `${cfg.baseUrl}${BROWSER_ENDPOINTS[browserName]}?token=${encodeURIComponent(cfg.token)}`;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
        body: JSON.stringify({ code: script, context: { url: baseUrl } }),
      });

      if (resp.status === 404) {
        message = `${BROWSER_LABELS[browserName] || browserName} is not available on this Browserless plan. Available browsers: Chrome, Edge, Chromium.`;
      } else if (!resp.ok) {
        const errText = await resp.text();
        message = `Browser service error (${resp.status}): ${errText.slice(0, 300)}`;
      } else {
        const result = await resp.json();
        const data = result?.data || result;
        status = data?.status === "pass" ? "pass" : "fail";
        message = data?.message || "";
        screenshot = data?.screenshot || null;
      }
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - started;

    const { error: insertError } = await supabase.from("test_run_results").insert({
      run_id,
      test_case_id,
      test_case_title: testCase.title,
      status,
      duration_ms: durationMs,
      error_log: status === "fail" ? message : "",
      screenshot_url: screenshot ? `data:image/jpeg;base64,${screenshot}` : "",
      browser: browserName,
    });
    if (insertError) throw insertError;

    const recentRuns = Array.isArray(testCase.recent_runs) ? testCase.recent_runs : [];
    const nextRuns = [...recentRuns, status].slice(-10);
    const fails = nextRuns.filter((r: string) => r === "fail").length;
    const passes = nextRuns.filter((r: string) => r === "pass").length;
    const flakyScore = fails > 0 && passes > 0 ? Math.round((fails / nextRuns.length) * 100) : 0;

    await supabase.from("test_cases").update({
      last_run_status: status,
      last_run_duration_ms: durationMs,
      recent_runs: nextRuns,
      flaky_score: flakyScore,
      updated_at: new Date().toISOString(),
    }).eq("id", test_case_id);

    return new Response(JSON.stringify({
      test_case_id,
      title: testCase.title,
      status,
      duration_ms: durationMs,
      error: status === "fail" ? message : "",
      screenshot: screenshot ? `data:image/jpeg;base64,${screenshot}` : "",
      browser: browserName,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
