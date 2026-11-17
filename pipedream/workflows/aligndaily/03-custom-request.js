import axios from "axios";

export default defineComponent({
  name: "custom_request",
  async run({ steps, $ }) {
    // --- ONLY handle POST (ignore OPTIONS/GET etc.) ---
    const method = (
      steps.trigger?.event?.method ||
      steps.trigger?.event?.http?.method ||
      ""
    ).toUpperCase();
    if (method !== "POST") return { skipped: true, method };

    // === GUARD: verify aa_session + require "aligndaily" ===
    const RUN_MODE = process.env.RUN_MODE || "dev";
    const CLAIM_SECRET = process.env.CLAIM_SECRET;
    const REQUIRED_PRODUCT = "aligndaily";
    const crypto = await import("crypto");

    if (!CLAIM_SECRET) return { success:false, error:"missing_claim_secret", user_message:"Access configuration error.", code:500 };
    if (!process.env.OPENAI_API_KEY) return { success:false, error:"missing_openai_key", user_message:"Service temporarily unavailable.", code:500 };

    const hdrs = steps.trigger?.event?.headers || {};
    const auth = hdrs.authorization || "";
    let token = (auth.match(/^Bearer\s+(.+)$/i) || [])[1] || null;

    if (!token) {
      const cookie = hdrs.cookie || "";
      const m = cookie.match(/(?:^|;\s*)aa_session=([^;]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
    if (!token) {
      const ct = String(hdrs["content-type"] || "").toLowerCase();
      if (ct.includes("application/json")) token = (steps.trigger?.event?.body || {}).aa_session || null;
    }
    if (!token) {
      return { success:false, error:"not_logged_in", user_message:"You’re not signed in. Please open your email link to access AlignDaily.", code:401 };
    }

    const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    const b64d = (txt) => Buffer.from(txt.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString();

    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") {
      return { success:false, error:"bad_token", user_message:"Your session is invalid. Please sign in again from your email link.", code:400 };
    }
    const [v, dataB64, sig] = parts;
    const expected = b64u(crypto.createHmac("sha256", CLAIM_SECRET).update(dataB64).digest());
    if (sig !== expected) {
      return { success:false, error:"bad_sig", user_message:"Your session has expired. Please sign in again from your email link.", code:401 };
    }
    const sst = JSON.parse(b64d(dataB64));

    // --- Optional passthrough email (do NOT send to model)
    const email = typeof steps.trigger?.event?.body?.email === "string"
      ? steps.trigger.event.body.email
      : null;

    // === CREDITS: need ≥1 aligndaily credit ===
    const STRIPE_SK = RUN_MODE === "prod" ? process.env.STRIPE_LIVE_SECRET : process.env.STRIPE_TEST_SECRET;
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(STRIPE_SK, { apiVersion: "2024-06-20" });

    const custs = await stripe.customers.list({ email: sst.sub, limit: 1 });
    if (!custs.data.length) {
      return { success:false, error:"no_customer", user_message:"Please open the access link in your email to check your credits.", code:403 };
    }
    const customer = custs.data[0];
    const ck = `credits_${REQUIRED_PRODUCT}`;
    const current = parseInt(customer.metadata?.[ck] || "0", 10) || 0;
    $.export("credits_before", { email: sst.sub, key: ck, current });
    if (current <= 0) {
      return { success:false, error:"no_credits", user_message:"You’ve used all your AlignDaily credits. Please purchase more to continue.", code:403 };
    }
    const __creditContext = { customerId: customer.id, key: ck, current };

// ---------------- PROMPT INPUTS ----------------
const req = (steps.trigger?.event?.body && typeof steps.trigger.event.body === "object")
  ? steps.trigger.event.body
  : {};

// Extract the prompt from prepare_prompt_core step (more robust)
const ppRaw = steps.prepare_prompt_core?.$return_value || 
              steps.prepare_prompt_core || 
              {};

const pp = (ppRaw && typeof ppRaw === "object") ? ppRaw : {};

// Extract promptSpec here so it's available throughout
const promptSpec = (pp.promptSpec && typeof pp.promptSpec === "object")
  ? pp.promptSpec
  : null;

// Debug: log what we actually received
$.export("debug_pp_structure", {
  hasPrompt: !!pp.prompt,
  hasPromptSpec: !!pp.promptSpec,
  promptLength: pp.prompt ? pp.prompt.length : 0,
  ppKeys: Object.keys(pp)
});

// Build the input text with multiple fallback paths
let inputText = "";

// Path 1: Direct prompt property (most common)
if (pp.prompt && typeof pp.prompt === "string" && pp.prompt.trim()) {
  inputText = pp.prompt.trim();
}

// Path 2: promptSpec.input
if (!inputText && pp.promptSpec?.input && typeof pp.promptSpec.input === "string") {
  inputText = pp.promptSpec.input.trim();
}

// Path 3: promptSpec.messages (flatten to text)
if (!inputText && pp.promptSpec?.messages && Array.isArray(pp.promptSpec.messages)) {
  const parts = pp.promptSpec.messages.map(m => {
    if (typeof m?.content === "string") return m.content;
    if (Array.isArray(m?.content)) {
      return m.content
        .map(p => (typeof p?.text === "string" ? p.text : ""))
        .join("\n");
    }
    return "";
  });
  inputText = parts.join("\n").trim();
}

// More detailed debug output
$.export("ad_prompt_extraction", {
  inputTextLength: inputText.length,
  inputTextPreview: inputText.slice(0, 200),
  source: inputText ? (pp.prompt ? "pp.prompt" : pp.promptSpec?.input ? "promptSpec.input" : "messages") : "none"
});

if (!inputText) {
  return {
    success: false,
    error: "empty_prompt",
    user_message: "We couldn't generate your plan. Please try again.",
    code: 422,
    debug: {
      ppKeys: Object.keys(pp || {}),
      hasPrompt: !!pp.prompt,
      hasPromptSpec: !!pp.promptSpec,
      promptSpecKeys: pp.promptSpec ? Object.keys(pp.promptSpec) : [],
      promptType: typeof pp.prompt,
      promptLength: pp.prompt ? String(pp.prompt).length : 0
    }
  };
}

// Debug from *this* step
$.export("ad_prompt_len", inputText ? String(inputText).length : 0);
$.export("ad_prompt_preview", (inputText || "").slice(0, 300));

if (!inputText) {
  return {
    success: false,
    error: "empty_prompt",
    user_message: "We couldn’t generate your plan. Please try again.",
    code: 422,
    debug: {
      hasPromptSpec: !!promptSpec,
      hasPromptText: !!rawPrompt && !!rawPrompt.trim(),
      ppKeys: Object.keys(pp || {}),
      promptSpecHasInput: !!(promptSpec && typeof promptSpec.input === "string" && promptSpec.input.trim()),
      ad_prompt_len_core: pp.ad_prompt_len ?? null,
      ad_prompt_preview_core: pp.ad_prompt_preview ?? null
    }
  };
}

    // ===== VALIDATION =====
    const ASSETS = steps.pp_static_assets?.$return_value || {};
    const ALLOWED_CUISINES = new Set((ASSETS.ALLOWED_CUISINES || []).map(s => String(s).toLowerCase()));
    const rawCuisine = String(req.cuisine || pp.cuisine || "").toLowerCase().trim();

    if (!rawCuisine) {
      return { success:false, error:"missing_cuisine", user_message:"Choose a cuisine style for your plan.", code:400 };
    }
    if (ALLOWED_CUISINES.size && !ALLOWED_CUISINES.has(rawCuisine)) {
      return { success:false, error:"unsupported_cuisine", user_message:"That cuisine isn’t supported yet. Pick another style.", code:422, cuisine: rawCuisine };
    }

    const workoutDays = Array.isArray(req["workoutDays[]"]) ? req["workoutDays[]"].filter(Boolean)
                      : Array.isArray(req.workoutDays) ? req.workoutDays.filter(Boolean)
                      : [];
    if (!workoutDays.length) {
      return { success:false, error:"no_workout_days", user_message:"Select at least one workout day.", code:422 };
    }
    const chosenSet = new Set(workoutDays.map(s => String(s).toLowerCase()));

    // ===== Responses API request body =====
    const url = "https://api.openai.com/v1/responses";
    const headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" };
    const MAX_OUT_TOKENS = Number(process.env.AD_MAX_OUT_TOKENS || 12000);

    // ===== Helpers =====
// Normalize category to one of our 8 buckets
function normalizeCat(raw="") {
  const s = String(raw).trim().toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");

  // canonical map
  const map = new Map([
    ["produce", "Produce"],
    ["veg", "Produce"],
    ["vegetable", "Produce"],
    ["fruit", "Produce"],

    ["protein", "Protein"],
    ["proteins", "Protein"],

    ["grains", "Grains"],
    ["grain", "Grains"],
    ["carbs", "Grains"],

    ["dairy", "Dairy / Alternatives"],
    ["alternatives", "Dairy / Alternatives"],
    ["dairy alternatives", "Dairy / Alternatives"],
    ["dairy / alternatives", "Dairy / Alternatives"],
    ["plant milk", "Dairy / Alternatives"],
    ["plant yogurt", "Dairy / Alternatives"],

    ["healthy fats", "Healthy Fats"],
    ["fats", "Healthy Fats"],
    ["nuts", "Healthy Fats"],
    ["seeds", "Healthy Fats"],

    ["pantry", "Pantry"],
    ["herbs", "Pantry"],
    ["spices", "Pantry"],
    ["condiments", "Pantry"],

    // 👇 explicit remaps to Pantry
    ["staples", "Pantry"],
    ["staple", "Pantry"],
    ["other", "Pantry"]
  ]);

  // direct hit
  if (map.has(s)) return map.get(s);

  // light heuristics for common phrasing
  if (/^produce|veg|vegetable|fruit/.test(s)) return "Produce";
  if (/^protein/.test(s)) return "Protein";
  if (/^grain|carb/.test(s)) return "Grains";
  if (/^dairy|alternative|plant (milk|yogurt)/.test(s)) return "Dairy / Alternatives";
  if (/fat|nuts?|seeds?/.test(s)) return "Healthy Fats";
  if (/herb|spice|pantry|condiment|staple|other/.test(s)) return "Pantry";

  // default fallback
  return "Pantry";
}

// Gentle singularization for dedupe keys
function canonKey(s=""){
  let t = String(s).toLowerCase().trim();
  t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const singular = {
    tomatoes:"tomato", potatoes:"potato", apples:"apple", pears:"pear", grapes:"grape",
    eggs:"egg", beans:"bean", chickpeas:"chickpea", lentils:"lentil",
    blueberries:"blueberry", strawberries:"strawberry",
    "pumpkin seeds":"pumpkin seed", "sunflower seeds":"sunflower seed", "chia seeds":"chia seed"
  };
  t = t.split(/\s+/).map(w => singular[w] || w).join(" ");
  return t;
}

function enforceProteinFloors(html, floors = { breakfast: 30, lunch: 25, dinner: 30 }) {
  try {
    const FLOORS = Object.assign({ breakfast: 30, lunch: 25, dinner: 30 }, floors);
    return html.replace(
      /<div class="meal-block">[\s\S]*?<p class="meal-title"><strong>\s*(Breakfast|Lunch|Dinner)\s*:\s*<\/strong>[\s\S]*?<\/div>/gi,
      (block) => {
        const mealMatch = block.match(/<strong>\s*(Breakfast|Lunch|Dinner)\s*:\s*<\/strong>/i);
        if (!mealMatch) return block;
        const meal = mealMatch[1].toLowerCase();
        const floor = FLOORS[meal] || 0;

        // Only touch if there is an existing numeric grams capture
        const rx = /<p>\s*<strong>\s*Protein:\s*<\/strong>\s*([^<]*?)\s*(?:\(~?\s*(\d+)\s*g\)?\s*)?•\s*<strong>\s*Micronutrients:/i;
        const m = block.match(rx);
        if (!m) return block;                 // no Protein line → do nothing
        const grams = Number(m[2] || NaN);
        if (!Number.isFinite(grams)) return block;  // no grams → do nothing
        if (grams >= floor) return block;           // already meets floor

        return block.replace(rx, (_0, source) =>
          `<p><strong>Protein:</strong> ${String(source).trim()} (~${floor}g) • <strong>Micronutrients:`
        );
      }
    );
  } catch { return html; }
}

    function enforceBreakfastShakeCap(html, { cap = 2, dietMode = "", dairyAllowed = true, dairyBreakfastCap = 2 } = {}) {
      try {
        const isShake = (txt) => /protein\s*shake|whey|casein|pea protein|rice protein|hemp protein/i.test(txt);
        const dairyTokens = /\b(greek\s*yogurt|yogurt|skyr|cottage\s*cheese|ricotta|feta|mozzarella|milk)\b/i;
        const dayBlockRx = /<div class="day-block">[\s\S]*?<h3>(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)<\/h3>[\s\S]*?(?=<div class="day-block">|<div class="force-break">|$)/gi;

        let usedShakes = 0;
        let usedDairyBreakfasts = 0;

        return html.replace(dayBlockRx, (dayHtml) => {
          const mealBlockRx = /<div class="meal-block">[\s\S]*?<p class="meal-title"><strong>\s*Breakfast\s*:\s*<\/strong>([\s\S]*?)<\/div>/i;
          const m = dayHtml.match(mealBlockRx);
          if (!m) return dayHtml;

          const block = m[0];

          if (!dairyAllowed && dairyTokens.test(block)) {
            const rebuiltDairy = block
              .replace(dairyTokens, "plant yogurt (unsweetened)")
              .replace(/<p>\s*<strong>\s*Protein:\s*<\/strong>[\s\S]*?<\/p>/i,
                `<p><strong>Protein:</strong> plant-based yogurt + seeds (~30g) • <strong>Micronutrients:</strong> </p>`);
            return dayHtml.replace(block, rebuiltDairy);
          } else if (dairyAllowed && dairyTokens.test(block)) {
            if (usedDairyBreakfasts >= dairyBreakfastCap) {
              const swapped = block.replace(dairyTokens, "plant yogurt (unsweetened)");
              return dayHtml.replace(block, swapped);
            }
            usedDairyBreakfasts += 1;
          }

          if (!isShake(block)) return dayHtml;
          if (usedShakes < cap) { usedShakes += 1; return dayHtml; }

          const isVeg = /vegan|vegetarian/i.test(dietMode);
          const fallbackTitle = isVeg ? "lentil breakfast bowl with greens and olive oil"
                                      : "eggs with sautéed vegetables and herbs";
          const proteinName = isVeg ? "lentils" : "eggs";

          const rebuilt =
            block
              .replace(/(<p class="meal-title"><strong>\s*Breakfast\s*:\s*<\/strong>)[\s\S]*?(<\/p>)/i, `$1 ${fallbackTitle}$2`)
              .replace(/<p>\s*<strong>\s*Protein:\s*<\/strong>[\s\S]*?<\/p>/i, `<p><strong>Protein:</strong> ${proteinName} (~30g) • <strong>Micronutrients:</strong> </p>`);

          return dayHtml.replace(block, rebuilt);
        });
      } catch { return html; }
    }
    
    function expandAndSanitizeLanguage(html) {
      const repl = [
        [/\bPB\b(?!\w)/gi, "peanut butter"],
        [/\bPB\s*powder\b/gi, "peanut butter"],
        [/\bDB\b(?!\w)/g, "dumbbell"],
        [/\bKB\b(?!\w)/g, "kettlebell"],
        [/\bRDL\b(?!\w)/g, "Romanian deadlift"],
        [/\bEMOM\b/gi, "every-minute-on-the-minute"],
        [/\bAMRAP\b/gi, "as many rounds as possible"],
        [/\bmins?\b/gi, "minutes"],
        [/\bsec\b/gi, "seconds"]
      ];
      let out = html;
      repl.forEach(([rx, sub]) => { out = out.replace(rx, sub); });
      return out;
    }
   
function removeSoyPerPolicy(html, dietMode = "", cuisine = "", soyPolicy = {}, userAskedSoyFree = false) {
  try {
    const forceRemove = !!soyPolicy.force_remove || userAskedSoyFree;
    if (!forceRemove) return html;

    const isVeg = /vegan|vegetarian/i.test(dietMode);
    const LEGUME_FALLBACK  = isVeg ? "chickpeas" : "white beans";
    const PROTEIN_FALLBACK = isVeg ? "lentils"  : "chicken";
    const UMAMI_SAUCE = /japanese|asian|thai|korean|chinese|vietnam/i.test(cuisine) ? "coconut aminos" : "balsamic glaze";

    let out = String(html || "");

    // swap proteins / condiments
    out = out.replace(/\btofu\b/gi, PROTEIN_FALLBACK)
             .replace(/\btempeh\b/gi, LEGUME_FALLBACK)
             .replace(/\bedamame\b/gi, LEGUME_FALLBACK)
             .replace(/\bsoy\s*sauce\b/gi, UMAMI_SAUCE)
             .replace(/\btamari\b/gi, UMAMI_SAUCE)
             .replace(/\bshoyu\b/gi, UMAMI_SAUCE)
             .replace(/\bmiso\b/gi, "chickpea miso");

    // preserve "Protein: X (~NNg) • Micronutrients:" structure
    // do not strip bullets; leave formatting as-is
    return out;
  } catch {
    return html;
  }
}

function removeDairyEverywhere(html) {
  try {
    let out = String(html || "");

    // Common dairy foods → plant alternatives
    out = out.replace(/\b(greek\s*yogurt|yogurt|skyr|kefir|milk|whole milk|2% milk|cream|half[-\s]?and[-\s]?half|butter|ghee|cheese|mozzarella|feta|ricotta|parmesan|pecorino|cottage\s*cheese|labneh)\b/gi,
                      (m) => {
                        if (/yogurt|skyr|kefir|labneh/i.test(m)) return "plant yogurt (unsweetened)";
                        if (/milk|cream|half/i.test(m))          return "plant milk (unsweetened)";
                        if (/butter|ghee/i.test(m))               return "plant-based butter";
                        return "plant-based cheese";
                      });

    // If a Protein line mentions dairy as the source, replace with a neutral source
    out = out.replace(/(<p>\s*<strong>\s*Protein:\s*<\/strong>\s*)([^<]*)(\s*~?\(\s*\d+\s*g\)\s*)?(\s*•\s*<strong>\s*Micronutrients:)/gi,
                      (m, p1, src, grams = "", p4) => {
                        if (/\b(yogurt|skyr|milk|cheese|ricotta|feta|cottage)/i.test(src))
                          return `${p1}eggs or legumes ${grams}${p4}`;
                        return m;
                      });

    return out;
  } catch { return html; }
}


// Pull [{item,cat}] straight from LEDGER_JSON
function collectIngredientsFromLedger(ledger) {
  if (!ledger || !Array.isArray(ledger.days)) return [];
  const pairs = [];
  for (const day of ledger.days) {
    const meals = day?.meals || {};
    for (const slot of ["breakfast","lunch","dinner"]) {
      const arr = meals[slot]?.ingredients;
      if (Array.isArray(arr)) {
        for (const it of arr) {
          const item = String(it?.item || "").trim();
          const cat  = normalizeCat(it?.cat || "");
          if (item) pairs.push({ item, cat });
        }
      }
    }
    if (Array.isArray(meals.snacks)) {
      for (const s of meals.snacks) {
        if (Array.isArray(s?.ingredients)) {
          for (const it of s.ingredients) {
            const item = String(it?.item || "").trim();
            const cat  = normalizeCat(it?.cat || "");
            if (item) pairs.push({ item, cat });
          }
        }
      }
    }
  }
  // de-dupe by (cat + canonKey(item))
  const seen = new Set();
  const out = [];
  for (const p of pairs) {
    const key = `${p.cat}::${canonKey(p.item)}`;
    if (!seen.has(key)) { seen.add(key); out.push(p); }
  }
  return out;
}

// Fallback if model didn't emit LEDGER_JSON
// Supports <li data-cat="Protein">Chicken</li>, otherwise falls back to Other
function collectIngredientsFromHiddenUL(html="") {
  const out = [];
  const seen = new Set();
  const rx = /<ul[^>]*class="[^"]*\bingredients\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi;
  let m;
  while ((m = rx.exec(html))) {
    const ul = m[1] || "";
    const liRx = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
    let li;
    while ((li = liRx.exec(ul))) {
      const attrs = li[1] || "";
      const txt = String(li[2] || "").replace(/<[^>]+>/g,"").trim();
      if (!txt) continue;
      const catAttr = (attrs.match(/\bdata-cat="([^"]+)"/i) || [])[1] || "";
      const cat = normalizeCat(catAttr || "pantry");
      const key = `${cat}::${canonKey(txt)}`;
      if (!seen.has(key)) { seen.add(key); out.push({ item: txt, cat }); }
    }
  }
  return out;
}

// 3) Rebuild the grocery grid *content* from (item,cat) pairs
//    - If a .grocery-grid already exists, replace its inner content
//    - If only a .grocery-list block exists, inject a new .grocery-grid after it
//      and make sure it has <h2>Grocery List</h2>
//    - If neither exists, append the full force-break + grocery-list + heading + grid
function rebuildGroceryGridFromPairs(html = "", pairs = []) {
  if (!Array.isArray(pairs) || pairs.length === 0) return html;

  const ORDER = [
    "Produce",
    "Protein",
    "Grains",
    "Dairy / Alternatives",
    "Healthy Fats",
    "Pantry"
  ];

  const byCat = new Map(ORDER.map(c => [c, new Set()]));
  for (const { item, cat } of pairs) {
    if (!item) continue;
    const c = ORDER.includes(cat) ? cat : "Pantry";
    byCat.get(c).add(item);
  }

  const sections = ORDER.map(cat => {
    const items = Array.from(byCat.get(cat)).sort((a, b) => a.localeCompare(b));
    const lis = items.map(x => `<li>${x}</li>`).join("\n");
    return `
  <div class="grocery-category">
    <p><strong>${cat}:</strong></p>
    <ul class="no-bullets">
${lis}
    </ul>
  </div>`.trim();
  }).join("\n");

  let out = String(html || "");

  // Case 1: replace an existing .grocery-grid block (keep heading + wrappers)
  const gridRx = /(<div\s+class="grocery-grid"[^>]*>)[\s\S]*?<\/div>/i;
  if (gridRx.test(out)) {
    return out.replace(gridRx, (_m, open) => `${open}\n${sections}\n</div>`);
  }

  // Case 2: .grocery-list exists but no .grocery-grid yet
  // Inject grid *after* the grocery-list block and ensure it has <h2>Grocery List</h2>
  const listBlockRx = /(<div\s+class="grocery-list"[^>]*>[\s\S]*?<\/div>)/i;
  if (listBlockRx.test(out)) {
    return out.replace(listBlockRx, (match) => {
      const hasHeading = /<h2[^>]*>\s*Grocery\s+List\s*<\/h2>/i.test(match);

      // if heading is missing, add it just before the closing </div> of grocery-list
      const withHeading = hasHeading
        ? match
        : match.replace(/<\/div>\s*$/i, `<h2>Grocery List</h2></div>`);

      return `${withHeading}
<div class="grocery-grid">
${sections}
</div>`;
    });
  }

  // Case 3: no grocery-list and no grocery-grid: append full block using your expected structure
  const block = `
<div class="force-break">
  <div class="grocery-list">
    <h2>Grocery List</h2>
  </div>
</div>
<div class="grocery-grid">
${sections}
</div>`.trim();

  return out + "\n" + block;
}

    
function extractLedgerAndHtml(planText = "") {
  if (typeof planText !== "string") return { ledger: null, html: "" };

  let text = planText.trim();
  let ledger = null;

  // A. strip fenced blocks that contain LEDGER_JSON
  const fenceRx = /```(?:json|js|javascript|txt|html)?[\s\S]*?LEDGER_JSON\s*=\s*(\{[\s\S]*?\})[\s\S]*?```/gi;
  text = text.replace(fenceRx, (_m, json) => {
    try { if (!ledger) ledger = JSON.parse(json); } catch {}
    return ""; // remove entire fenced block
  });

  // B. strip bare lines: LEDGER_JSON = { ... }
  const bareRx = /^\s*(?:const\s+[A-Z0-9_]+\s*=\s*)?LEDGER_JSON\s*=\s*(\{[\s\S]*?\})\s*$/gmi;
  text = text.replace(bareRx, (_m, json) => {
    try { if (!ledger) ledger = JSON.parse(json); } catch {}
    return ""; // remove the bare line
  });

  // C. strip HTML-escaped variants (rare, but safe to catch)
  const escRx = /LEDGER_JSON\s*=\s*\{[\s\S]*?\}(?=<\/|$)/gi;
  text = text.replace(escRx, "");

  // D. clean common code-block fencing left behind
  text = text.replace(/^```(?:html)?\s*|\s*```$/g, "");

  return { ledger, html: text.trim() };
}

// 1) Remove ingredients ULs (keep them in DOM for parsing; make them invisible)
function stripIngredientULs(html = "") {
  return String(html || "").replace(
    /<ul[^>]*class="[^"]*\bingredients\b[^"]*"[^>]*>[\s\S]*?<\/ul>/gi,
    ""
  );
}

// 2) If some model drift drops a tail/keystone block *inside a meal*, remove it there.
// We DO NOT move/hoist anything—prepare_prompt_core controls true placement.
function purgeIntrusionsInsideMealsOnly(html = "") {
  const BAD = [
    /<div\s+class="keystone">[\s\S]*?<\/div>/gi,
    /<div\s+class="grocery-list">[\s\S]*?<\/div>/gi,
    /<div\s+class="grocery-grid">[\s\S]*?<\/div>/gi,
    /<div\s+class="flowproofing">[\s\S]*?<\/div>/gi,
    /<div\s+class="disclaimer-block">[\s\S]*?<\/div>/gi
  ];
  return String(html || "").replace(
    /<div\s+class="meal-block">[\s\S]*?<\/div>/gi,
    block => BAD.reduce((acc, rx) => acc.replace(rx, ""), block)
  );
}

// Remove orphaned grocery-category divs that appear outside the main grocery-grid
function removeOrphanedCategoryHeaders(html = "") {
  // Strategy: Find the closing tag of the first grocery-grid, then nuke any grocery-category blocks after it
  
  const gridStartMatch = html.match(/<div\s+class="grocery-grid"[^>]*>/i);
  if (!gridStartMatch) return html; // no grid found, return as-is
  
  const gridStartPos = html.indexOf(gridStartMatch[0]);
  const beforeGrid = html.substring(0, gridStartPos);
  
  // Find the matching closing </div> for the grocery-grid
  let depth = 0;
  let pos = gridStartPos + gridStartMatch[0].length;
  let gridEndPos = -1;
  
  while (pos < html.length) {
    const nextOpen = html.indexOf('<div', pos);
    const nextClose = html.indexOf('</div>', pos);
    
    if (nextClose === -1) break; // no more closing tags
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      if (depth === 0) {
        gridEndPos = nextClose + 6; // include the </div>
        break;
      }
      depth--;
      pos = nextClose + 6;
    }
  }
  
  if (gridEndPos === -1) return html; // couldn't find the end
  
  const gridBlock = html.substring(gridStartPos, gridEndPos);
  const afterGrid = html.substring(gridEndPos);
  
  // Remove any orphaned grocery-category blocks from afterGrid
  const cleanedAfter = afterGrid.replace(
    /<div\s+class="grocery-category"[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  
  return beforeGrid + gridBlock + cleanedAfter;
}
    
function validateWorkoutsByDay(html, chosenSet) {
  try {
    if (!html) return { ok: true, errors: [] };
    if (!(chosenSet instanceof Set) || chosenSet.size === 0) return { ok: true, errors: [] };

    // collect days present in the plan
    const present = new Set();
    html.replace(/<h3>(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)<\/h3>/gi, (_, d) => {
      present.add(String(d).toLowerCase());
      return _;
    });

    const missing = [];
    for (const d of chosenSet) {
      if (!present.has(String(d).toLowerCase())) missing.push(`Missing day block: ${d}`);
    }

    // TOLERANCE: if the day exists, we don't care how many workouts it contains
    if (missing.length) return { ok: false, errors: missing };
    return { ok: true, errors: [] };
  } catch {
    // never block on validator errors
    return { ok: true, errors: [] };
  }
}
    function looksTruncated(s=""){
      if (!s) return true;
      if (/[<][^>]*$/.test(s)) return true; // cut mid-tag
      const opens  = (s.match(/<div\b/gi) || []).length;
      const closes = (s.match(/<\/div>/gi) || []).length;
      if (opens - closes > 3) return true;
      return false;
    }

function toResponsesInput(pp) {
  if (!pp || typeof pp !== "object") return "";

  // 1) If prepare_prompt_core gave us a prompt string, trust it first
  if (typeof pp.prompt === "string" && pp.prompt.trim().length) {
    return pp.prompt.trim();
  }

  const ps = pp.promptSpec;

  // 2) If we have messages (old chat-style shape), flatten them
  if (ps && Array.isArray(ps.messages)) {
    const parts = ps.messages.map(m => {
      if (typeof m?.content === "string") return m.content;
      if (Array.isArray(m?.content)) {
        return m.content
          .map(p => (typeof p?.text === "string" ? p.text : ""))
          .join("\n");
      }
      return "";
    });
    const flat = parts.join("\n").trim();
    if (flat) return flat;
  }

  // 3) If prepare_prompt_core set an input field, use it
  if (ps && typeof ps.input === "string" && ps.input.trim().length) {
    return ps.input.trim();
  }

  // Nothing usable
  return "";
}
    
// ===== OPENAI CALL =====
let resp;
try {
  // Build text from prepare_prompt_core’s output
  const inputText = toResponsesInput(pp);

  // Debug so we can see what CORE actually produced
  $.export("ad_prompt_len", inputText ? inputText.length : 0);
  $.export("ad_prompt_preview", (inputText || "").slice(0, 300));
  $.export("ad_pp_keys", Object.keys(pp || {}));

  if (!inputText) {
    return {
      success: false,
      error: "empty_prompt",
      user_message: "We couldn’t generate your plan. Please try again.",
      code: 422,
      debug: {
        hasPromptSpec: !!pp.promptSpec,
        hasPromptText: typeof pp.prompt === "string" && !!pp.prompt.trim(),
        ppKeys: Object.keys(pp || {})
      }
    };
  }

  const body = {
    model: (promptSpec && promptSpec.model) || process.env.OPENAI_MODEL || "gpt-4.1",
    input: inputText,  // 👈 now actually defined
    temperature: (promptSpec && typeof promptSpec.temperature === "number")
      ? promptSpec.temperature
      : 0.65,
    max_output_tokens: MAX_OUT_TOKENS
  };

  resp = await axios.post(url, body, {
    headers,
    timeout: 240000,
    maxBodyLength: 10 * 1024 * 1024,
    maxContentLength: 10 * 1024 * 1024,
    validateStatus: s => s >= 200 && s < 300
  });

} catch (error) {
  const status = error.response?.status || 502;
  const apiErr = error.response?.data || null;
  if (error.code === "ECONNABORTED") {
    return { success:false, error:"openai_timeout", user_message:"The plan is taking too long to generate. Please try again.", code:504 };
  }
  if (apiErr?.error) {
    return { success:false, error:"openai_error", user_message:"We couldn’t generate your plan. Please retry in a few minutes.", code: status, reason: apiErr.error?.message || null, type: apiErr.error?.type || null };
  }
  return { success:false, error:"openai_error", user_message:"We couldn’t generate your plan. Please retry in a few minutes.", code: status, reason: String(error?.message || "network_error") };
}

    // Normalize text
   let planText = resp.data?.output_text?.trim?.() || "";
if (!planText && Array.isArray(resp.data?.output)) {
  const first = resp.data.output.find(o => Array.isArray(o?.content));
  const c = first?.content?.find(x => x?.text);
  if (c?.text) planText = String(c.text).trim();
}
if (!planText && typeof resp.data?.choices?.[0]?.message?.content === "string") {
  planText = resp.data.choices[0].message.content.trim();
}
    if (!planText) {
      return { success:false, error:"openai_empty", user_message:"We couldn’t generate your plan. Please try again.", code:502, raw: resp.data };
    }

// Extract LEDGER_JSON and clean model HTML
const { ledger: planLedger, html: modelHtml } = extractLedgerAndHtml(planText);

// Initialize finalPlan from the model HTML (fallback to raw text)
let finalPlan = modelHtml || planText;

// Apply global ban (all meals/snacks)
if (pp.dairy_free_global) {
  finalPlan = removeDairyEverywhere(finalPlan);
}

    // ===== POSTPROCESS & ENFORCEMENT =====

    // language + protein floors + breakfast caps + soy
    finalPlan = expandAndSanitizeLanguage(finalPlan);
    finalPlan = enforceProteinFloors(finalPlan, {
      breakfast: Number(pp.breakfast_protein_floor_g ?? 30),
      lunch: 25,
      dinner: 30
    });
finalPlan = enforceBreakfastShakeCap(finalPlan, {
  cap: Number(pp.breakfast_policy?.shake_cap_per_week ?? pp.breakfast_shake_max ?? 2),
  minProtein: Number(pp.breakfast_policy?.shake_min_protein_g ?? pp.breakfast_protein_floor_g ?? 30),
  powders: Array.isArray(pp.breakfast_policy?.shake_bases) ? pp.breakfast_policy.shake_bases : [],
  liquids: Array.isArray(pp.breakfast_policy?.shake_liquids) ? pp.breakfast_policy.shake_liquids : [],
  addInsAllowed: Array.isArray(pp.breakfast_policy?.add_ins_allowed) ? pp.breakfast_policy.add_ins_allowed : [],
  noGoAddIns: Array.isArray(pp.breakfast_policy?.no_go_add_ins) ? pp.breakfast_policy.no_go_add_ins : [],
  dietMode: String(pp.diet_mode || ""),
  dairyAllowed: !!pp.dairy_policy?.allowed,
  dairyBreakfastCap: Number(pp.dairy_policy?.cap_per_week_breakfast ?? 0)
});
const b = steps.trigger?.event?.body || {};
const userFoodRestrictions = Array.isArray(b.foodRestrictions) ? b.foodRestrictions : [];

finalPlan = removeSoyPerPolicy(
  finalPlan,
  String(pp.diet_mode || ""),
  String(pp.cuisine || ""),
  pp.soy_policy_runtime || pp.soy_policy || {},
  userFoodRestrictions.some(x => /soy-?free|no\s*soy/i.test(String(x)))
);

// A) Grocery ONLY (keep your current LEDGER → pairs code)
let groceryPairs = collectIngredientsFromLedger(planLedger);
if (!groceryPairs.length) groceryPairs = collectIngredientsFromHiddenUL(finalPlan);


// Debug: count how many grocery-grid blocks exist
const gridCount = (finalPlan.match(/<div\s+class="grocery-grid"/gi) || []).length;
$.export("debug_grid_count", gridCount);
    
finalPlan = rebuildGroceryGridFromPairs(finalPlan, groceryPairs);
  $.export("ad_debug_grocery", {
  source: planLedger && Array.isArray(planLedger?.days) ? "LEDGER_JSON" : "INLINE_UL",
  pairsCount: groceryPairs.length
});

// Debug: verify we still have the right structure
const gridCountAfter = (finalPlan.match(/<div\s+class="grocery-grid"/gi) || []).length;
$.export("debug_grid_count_after", gridCountAfter);
    
// B) Never let ledgers render
finalPlan = stripIngredientULs(finalPlan)
  .replace(/```(?:json|js|javascript|txt|html)?[\s\S]*?LEDGER_JSON[\s\S]*?```/gi, "")
  .replace(/^\s*(?:const\s+[A-Z0-9_]+\s*=\s*)?LEDGER_JSON\s*=\s*\{[\s\S]*?\}\s*$/gmi, "")
  .replace(/LEDGER_JSON\s*=\s*\{[\s\S]*?\}/gi, "");

// C) Only prevent intrusions *inside meals* (we do not hoist or move sections)
finalPlan = purgeIntrusionsInsideMealsOnly(finalPlan);

finalPlan = removeOrphanedCategoryHeaders(finalPlan);

// Remove Keystone blocks entirely when disabled (belt-and-suspenders)
const keystoneEnabled = !!pp.keystone_enabled;
if (!keystoneEnabled) {
  finalPlan = String(finalPlan || "").replace(/<div\s+class="keystone">[\s\S]*?<\/div>/gi, "");
 }

const vDays = validateWorkoutsByDay(finalPlan, chosenSet);
if (!vDays.ok) {
  $.export("warn_days", vDays.errors);  // surface to logs; don't block generation
}

    
// tail presence debug – non-blocking
const hasFlow = /<div\s+class="flowproofing"/i.test(finalPlan);
const hasDisc = /<div\s+class="disclaimer-block"/i.test(finalPlan);

if (!hasFlow || !hasDisc) {
  $.export("warn_tail_missing", {
    hasFlow,
    hasDisc,
    len: (finalPlan || "").length
  });
}

    
// shape/truncation checks
    if (looksTruncated(finalPlan)) {
      return { success:false, error:"model_truncated", user_message:"We couldn’t finish your plan in time. Please try again.", code:502, previewLen: (finalPlan||"").length };
    }
    
// Minimal final shape (robust)
const okMeals =
  /<h4[^>]*>\s*Meals\s*<\/h4>/i.test(finalPlan) ||
  /<div\s+class="meal-block">/i.test(finalPlan);

// Treat grocery as OK if we either:
//  - have a visible .grocery-grid, OR
//  - successfully extracted ingredient pairs (LEDGER_JSON or INLINE_UL)
const okGrid =
  /<div\s+class="grocery-grid"/i.test(finalPlan) ||
  (Array.isArray(groceryPairs) && groceryPairs.length > 0);

// If we *do* have pairs but no visible grid, surface a warning for logs only.
if (!/<div\s+class="grocery-grid"/i.test(finalPlan) && okGrid) {
  $.export("warn_okGrid_noWrapper", {
    gridPresent: false,
    pairsCount: Array.isArray(groceryPairs) ? groceryPairs.length : 0
  });
}

// tolerate <br> tags if the model insists; your polish removed most already
const noMd = !/^\s*#|\*\*|^- |\d+\.\s/m.test(finalPlan);

if (!(okMeals && okGrid && noMd)) {
  const fails = [];
  if (!okGrid)  fails.push("okGrid");
  if (!okMeals) fails.push("okMeals");
  if (!noMd)    fails.push("noMd");
  return {
    success:false,
    error:"bad_shape",
    user_message:"The plan could not be generated correctly. Please try again.",
    code:422,
    details: fails
  };
}

    // === DECREMENT exactly once, only after final success ===
    let decrementError = null;
    try {
      const newValue = Math.max(0, __creditContext.current - 1);
      await stripe.customers.update(__creditContext.customerId, { metadata: { [__creditContext.key]: String(newValue) } });
      $.export("credits_after", { email: sst.sub, key: __creditContext.key, newValue });
    } catch (err) {
      decrementError = { error: "could_not_decrement", detail: String(err?.message || err) };
      console.error("⚠️ Credit decrement failed:", decrementError);
    }

    return { success:true, version:"v1", plan: finalPlan, email, raw: resp.data, decrement: null };
  }
});
