import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

    if (req.method === "GET") {
      const { data } = await supabase.from("app_settings").select("key, value");
      const settings: Record<string, string> = {};
      for (const row of data || []) {
        if (row.key === "OPENAI_API_KEY" || row.key === "BROWSERLESS_API_KEY") {
          settings[row.key] = row.value ? row.value.slice(0, 8) + "..." : "";
        } else {
          settings[row.key] = row.value;
        }
      }

      const { data: creds } = await supabase.from("credentials").select("*");
      const credentials = (creds || []).map((c) => ({
        ...c,
        password: c.password ? "••••••••" : "",
      }));

      return new Response(JSON.stringify({ settings, credentials }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { settings, credentials } = body;
      const updates: { key: string; value: string }[] = [];

      for (const [key, value] of Object.entries(settings || {})) {
        if ((key === "OPENAI_API_KEY" || key === "BROWSERLESS_API_KEY") && typeof value === "string" && value.endsWith("...")) {
          continue;
        }
        updates.push({ key, value: value as string });
      }

      for (const update of updates) {
        await supabase
          .from("app_settings")
          .upsert({ key: update.key, value: update.value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      }

      if (Array.isArray(credentials)) {
        for (const cred of credentials) {
          const { project_id, environment } = cred;
          if (!project_id || !environment) continue;
          const payload: Record<string, string> = {
            project_id,
            environment,
            login_url: cred.login_url || "",
            username: cred.username || "",
            username_selector: cred.username_selector || "",
            password_selector: cred.password_selector || "",
            submit_selector: cred.submit_selector || "",
            updated_at: new Date().toISOString(),
          };
          if (typeof cred.password === "string" && cred.password !== "" && cred.password !== "••••••••") {
            payload.password = cred.password;
          }
          await supabase.from("credentials").upsert(payload, { onConflict: "project_id,environment" });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
