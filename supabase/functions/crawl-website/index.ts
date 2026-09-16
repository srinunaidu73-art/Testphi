import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
    try {
      const url = new URL(href, baseUrl);
      links.add(url.href);
    } catch {
      // skip invalid URLs
    }
  }
  return Array.from(links);
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : "Untitled Page";
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  return match ? match[1].trim() : "";
}

function extractForms(html: string): { action: string; method: string; fields: string[] }[] {
  const forms: { action: string; method: string; fields: string[] }[] = [];
  const formRegex = /<form[^>]*>/gi;
  const inputRegex = /<input[^>]+name=["']([^"']+)["']/gi;
  let formMatch;
  while ((formMatch = formRegex.exec(html)) !== null) {
    const formTag = formMatch[0];
    const actionMatch = formTag.match(/action=["']([^"']+)["']/i);
    const methodMatch = formTag.match(/method=["']([^"']+)["']/i);
    const fields: string[] = [];
    let inputMatch;
    const remainingHtml = html.slice(formMatch.index);
    const formEnd = remainingHtml.search(/<\/form>/i);
    const formHtml = formEnd > 0 ? remainingHtml.slice(0, formEnd) : remainingHtml.slice(0, 5000);
    while ((inputMatch = inputRegex.exec(formHtml)) !== null) {
      fields.push(inputMatch[1]);
    }
    forms.push({
      action: actionMatch ? actionMatch[1] : "",
      method: methodMatch ? methodMatch[1].toUpperCase() : "GET",
      fields,
    });
  }
  return forms;
}

function extractHeadings(html: string): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  const hRegex = /<h([1-3])[^>]*>([^<]+)<\/h[1-3]>/gi;
  let match;
  while ((match = hRegex.exec(html)) !== null) {
    headings.push({ level: parseInt(match[1]), text: match[2].trim() });
  }
  return headings;
}

function extractButtons(html: string): string[] {
  const buttons: string[] = [];
  const btnRegex = /<(?:button|a[^>]*role=["']button["'])[^>]*>([^<]{2,50})<\/(?:button|a)>/gi;
  let match;
  while ((match = btnRegex.exec(html)) !== null) {
    const text = match[1].trim();
    if (text.length > 1) buttons.push(text);
  }
  return [...new Set(buttons)].slice(0, 20);
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

async function fetchWithTimeout(url: string, ua: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRenderedPage(url: string, token: string, baseUrl: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const endpoint = `${baseUrl.replace(/\/+$/, "")}/content?token=${encodeURIComponent(token)}`;
    return await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({
        url,
        waitForTimeout: 3000,
        bestAttempt: true,
        blockAds: true,
        rejectResourceTypes: ["image", "media", "font"],
        viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
        userAgent: USER_AGENTS[0],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(url: string, browserless: { token: string; baseUrl: string }): Promise<Response> {
  if (browserless.token) {
    try {
      const response = await fetchRenderedPage(url, browserless.token, browserless.baseUrl);
      if (response.ok) return response;
    } catch {
      // fall through to plain fetch below
    }
  }

  let lastError: Error | null = null;
  for (const ua of USER_AGENTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchWithTimeout(url, ua);
        if (response.status !== 403 && response.status !== 429) {
          return response;
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        lastError = err as Error;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw lastError || new Error("Failed to fetch page");
}

function categorizePage(url: string, title: string, forms: any[], headings: any[], buttons: string[]): string {
  const text = [url, title, ...headings.map((h: any) => h.text)].join(" ").toLowerCase();
  const hasAuth = /\b(login|signin|sign in|log in|auth|password|forgot password)\b/.test(text);
  const hasRegister = /\b(register|signup|sign up|create account|join now)\b/.test(text);
  const hasPayment = /\b(checkout|payment|pay|billing|card|invoice|purchase)\b/.test(text);
  const hasCart = /\b(cart|basket|shopping bag)\b/.test(text);
  const hasSearch = /\b(search|find|filter|results)\b/.test(text);
  const hasContact = /\b(contact|support|help|feedback)\b/.test(text);
  const hasAccount = /\b(account|profile|dashboard|settings|preferences)\b/.test(text);
  const hasProduct = /\b(product|item|listing|catalog|shop)\b/.test(text);

  if (hasAuth) return "Authentication";
  if (hasRegister) return "Registration";
  if (hasPayment) return "Checkout";
  if (hasCart) return "Shopping Cart";
  if (hasSearch) return "Search";
  if (hasContact) return "Contact Form";
  if (hasAccount) return "User Account";
  if (hasProduct) return "Product Page";
  if (forms.length > 0) return "Form Page";
  return "Content Page";
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

    const { data: settingsRows } = await supabase.from("app_settings").select("key, value");
    const settings: Record<string, string> = {};
    for (const row of settingsRows || []) settings[row.key] = row.value;
    const browserless = {
      token: settings["BROWSERLESS_API_KEY"] || Deno.env.get("BROWSERLESS_API_KEY") || "",
      baseUrl: settings["BROWSERLESS_BASE_URL"] || "https://chrome.browserless.io",
    };

    const { url, project_id, max_pages } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const maxPages = Math.min(max_pages || 15, 25);
    const baseUrl = new URL(url);
    const origin = baseUrl.origin;

    const visited = new Set<string>();
    const toVisit = [url];
    const pages: {
      url: string;
      title: string;
      description: string;
      category: string;
      forms: { action: string; method: string; fields: string[] }[];
      headings: { level: number; text: string }[];
      buttons: string[];
      status: number;
    }[] = [];

    while (toVisit.length > 0 && pages.length < maxPages) {
      const currentUrl = toVisit.shift()!;
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      try {
        const response = await fetchPage(currentUrl, browserless);

        if (!response.ok) {
          pages.push({
            url: currentUrl,
            title: "Error",
            description: `HTTP ${response.status}`,
            category: "Error",
            forms: [],
            headings: [],
            buttons: [],
            status: response.status,
          });
          continue;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          continue;
        }

        const html = await response.text();
        const title = extractTitle(html);
        const description = extractMetaDescription(html);
        const forms = extractForms(html);
        const headings = extractHeadings(html);
        const buttons = extractButtons(html);
        const category = categorizePage(currentUrl, title, forms, headings, buttons);

        pages.push({ url: currentUrl, title, description, category, forms, headings, buttons, status: 200 });

        // Extract links and queue same-origin pages
        const links = extractLinks(html, currentUrl);
        for (const link of links) {
          try {
            const linkUrl = new URL(link);
            if (linkUrl.origin === origin && !visited.has(link) && !toVisit.includes(link)) {
              // Skip static assets
              if (/\.(jpg|jpeg|png|gif|svg|css|js|pdf|zip|ico|woff|ttf)(\?|$)/i.test(link)) continue;
              toVisit.push(link);
            }
          } catch {
            // skip invalid
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const hint = msg.includes("abort") || msg.includes("timeout")
          ? "The site did not respond within 10 seconds."
          : msg.includes("403") || msg.includes("Forbidden")
          ? "The site is blocking automated visits."
          : msg;
        pages.push({
          url: currentUrl,
          title: "Fetch Error",
          description: hint,
          category: "Error",
          forms: [],
          headings: [],
          buttons: [],
          status: 0,
        });
      }
    }

    // Generate requirements from crawled pages
    const requirements: {
      project_id: string;
      req_id: string;
      title: string;
      description: string;
      source: string;
      source_ref: string;
      is_critical: boolean;
      has_coverage: boolean;
    }[] = [];

    const criticalCategories = ["Authentication", "Registration", "Shopping Cart", "Checkout"];
    let reqCounter = 1;

    for (const page of pages) {
      if (page.category === "Error") continue;

      const reqId = `CRAWL-${String(reqCounter).padStart(2, "0")}`;
      reqCounter++;

      const formInfo = page.forms.length > 0
        ? ` Contains ${page.forms.length} form(s) with fields: ${page.forms.flatMap(f => f.fields).join(", ")}.`
        : "";
      const headingInfo = page.headings.length > 0
        ? ` Page sections: ${page.headings.map(h => h.text).join(", ")}.`
        : "";
      const buttonInfo = page.buttons.length > 0
        ? ` Interactive elements: ${page.buttons.join(", ")}.`
        : "";

      requirements.push({
        project_id,
        req_id: reqId,
        title: `${page.category}: ${page.title}`,
        description: `Page at ${page.url}.${formInfo}${headingInfo}${buttonInfo} ${page.description}`.trim(),
        source: "url",
        source_ref: page.url,
        is_critical: criticalCategories.includes(page.category) || page.forms.some((f: any) => (f.fields || []).some((field: string) => /password|card|credit|email|otp|token|ssn|account/i.test(field))),
        has_coverage: false,
      });
    }

    // Insert requirements into database
    let insertedReqs: any[] = [];
    if (requirements.length > 0) {
      const { data, error } = await supabase
        .from("requirements")
        .insert(requirements)
        .select();

      if (error) throw error;
      insertedReqs = data || [];
    }

    return new Response(JSON.stringify({
      url,
      pages_crawled: pages.length,
      pages: pages.map(p => ({ url: p.url, title: p.title, category: p.category, status: p.status })),
      requirements_generated: insertedReqs.length,
      requirements: insertedReqs,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
