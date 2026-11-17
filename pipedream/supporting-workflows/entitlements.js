export default defineComponent({
  async run({ steps, $ }) {
    const CLAIM_SECRET = process.env.CLAIM_SECRET;
    const RUN_MODE = process.env.RUN_MODE || "dev";
    const STRIPE_SK = RUN_MODE === "prod" ? process.env.STRIPE_LIVE_SECRET : process.env.STRIPE_TEST_SECRET;

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(STRIPE_SK, { apiVersion: "2024-06-20" });
    const crypto = await import("crypto");

    // CORS / preflight
    const ORIGIN = steps.trigger.event.headers.origin || "";
    const allow = ORIGIN && ORIGIN.includes("alchalign.com") ? ORIGIN : "*";
    if ((steps.trigger.event.method || "").toUpperCase() === "OPTIONS") {
      return $.respond({ status: 204, headers: {
        "Access-Control-Allow-Origin": allow,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      }, body: "" });
    }

    // Get token from Bearer or cookie
    const hdr = steps.trigger.event.headers || {};
    const mAuth = (hdr.authorization || "").match(/^Bearer\s+(.+)$/i);
    let token = mAuth ? mAuth[1] : null;
    if (!token) {
      const m = (hdr.cookie || "").match(/(?:^|;\s*)aa_session=([^;]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
    if (!token) return $.respond({ status: 401, headers: { "Access-Control-Allow-Origin": allow }, body: "not_logged_in" });

    // Verify HMAC token
    const b64u = (buf)=>Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    const b64d = (t)=>Buffer.from(t.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString();
    const [v, data, sig] = token.split(".");
    const expSig = b64u(crypto.createHmac("sha256", CLAIM_SECRET).update(data).digest());
    if (sig !== expSig) return $.respond({ status: 401, headers: { "Access-Control-Allow-Origin": allow }, body: "bad_sig" });
    const payload = JSON.parse(b64d(data));
    if (payload.exp && payload.exp < Math.floor(Date.now()/1000)) {
      return $.respond({ status: 401, headers: { "Access-Control-Allow-Origin": allow }, body: "expired" });
    }

    const email = payload.sub || "";

    
// --- choose best Stripe customer & compute credits/products ---

function extractCredits(md = {}) {
  const credits = {};
  let total = 0;
  for (const [k, v] of Object.entries(md)) {
    const m = k.match(/^credits_(.+)$/);
    if (!m) continue;
    const prod = m[1].toLowerCase();
    const n = parseInt(v, 10) || 0;
    credits[prod] = n;
    total += Math.max(0, n);
  }
  return { credits, total };
}

let customer = null;

// 1) Prefer customer_id from the token (if your Claim now sets it)
if (payload.customer_id) {
  try {
    const c = await stripe.customers.retrieve(payload.customer_id);
    if (!c?.deleted) customer = c;
  } catch {}
}

// 2) Fallback: search by email and pick the best (by total credits, then recency)
if (!customer && email) {
  const custs = await stripe.customers.list({ email, limit: 100 });
  let best = null;
  let bestScore = -1;

  for (const c of custs.data) {
    const { credits: cts, total } = extractCredits(c.metadata || {});
    const updated = Number(c.updated || c.created || 0);
    const score = total * 1e6 + updated; // prioritize total credits, then recency
    if (score > bestScore) {
      best = { ref: c, credits: cts, total, updated };
      bestScore = score;
    }
  }
  if (best) customer = best.ref;
}

// 3) Compute credits and products
let credits = {};
let finalProducts = [];

if (customer) {
  const out = extractCredits(customer.metadata || {});
  credits = out.credits;
  finalProducts = Object.keys(credits).filter((k) => (credits[k] || 0) > 0);
}

// 4) If no products from credits, fall back to token's products
if (!finalProducts.length) {
  const tokenProducts = Array.isArray(payload.products) ? payload.products : [];
  finalProducts = tokenProducts.map((p) => String(p || "").toLowerCase());
}

// Debug crumbs for logs
$.export("entitlements_choice", {
  email,
  chosen_customer_id: customer?.id || null,
  products: finalProducts,
  credits,
});

// Respond (note: products derived from credits/token)
return $.respond({
  status: 200,
  headers: {
    "content-type": "application/json",
    "Access-Control-Allow-Origin": allow,
    // If you rely on cookies here, also add:
    // "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  },
  body: JSON.stringify({
    email,
    products: finalProducts,
    credits,
    customer_id: customer?.id || null
  })
});


    
  }
});
