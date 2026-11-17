import OpenAI from "openai";

function validateCard(card) {
  const req = ["onTheSurface","considerThis","theUndercurrent","whatsEmerging","whatsRunningYourLife","theExchange","hiddenIntelligence","theOpening","reorientation","notice"];
  const missing = req.filter(k => !(k in card));
  return { ok: missing.length === 0, missing };
}

export default defineComponent({
  async run({ steps, $ }) {
    const envOK = !!process.env.OPENAI_API_KEY;
    $.export("env_ok", envOK);

    // ===== Access guard (verify aa_session + require "fathom") =====
    const RUN_MODE = process.env.RUN_MODE || "dev";
    const CLAIM_SECRET = process.env.CLAIM_SECRET;
    const crypto = await import("crypto");

    // pull aa_session from Authorization, Cookie, or JSON body (aa_session)
    const hdrs = steps.trigger?.event?.headers || {};
    const auth = hdrs.authorization || hdrs.Authorization || "";
    let token = (auth.match(/^Bearer\s+(.+)$/i) || [])[1] || null;
    if (!token) {
      const cookie = hdrs.cookie || "";
      const m = cookie.match(/(?:^|;\s*)aa_session=([^;]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
    if (!token) {
      const ct = String(hdrs["content-type"] || "").toLowerCase();
      if (ct.includes("application/json")) {
        const body = steps.trigger?.event?.body || {};
        token = body.aa_session || null;
      }
    }
    if (!token) return { success:false, error:"no_token", code:401 };

    const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    const b64d = (txt) => Buffer.from(txt.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString();

    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return { success:false, error:"bad_token", code:400 };
    const [v, data, sig] = parts;
    const expected = b64u(crypto.createHmac("sha256", CLAIM_SECRET).update(data).digest());
    if (sig !== expected) {
      $.export("claim_secret_len", (CLAIM_SECRET || "").length);
      $.export("sig_expected_8", expected.slice(0,8));
      $.export("sig_provided_8", String(sig||"").slice(0,8));
      return { success:false, error:"bad_sig", hint:"CLAIM_SECRET mismatch or stale token (dev/prod). Re-mint via magic link.", code:401 };
    }

    const sst = JSON.parse(b64d(data)); // { sub, products, exp, ... }
    const now = Math.floor(Date.now()/1000);
    const SKEW = 300; // 5 min
    if (sst.exp && sst.exp < (now - SKEW)) return { success:false, error:"expired", code:401 };

    // Support product aliases/bundles
    const ALIASES = { bundle_all:["fathom","sliproot","aligndaily","alignmentscan"], alchAlignBundle:["fathom","sliproot","aligndaily","alignmentscan"] };
    const products = Array.isArray(sst.products) ? sst.products : [];
    const expanded = new Set(products);
    for (const p of products) (ALIASES[p] || []).forEach(x => expanded.add(x));
    $.export("token_has_fathom", expanded.has("fathom")); // diagnostic only
    $.export("user_email", sst.sub);

    // ===== Credits check (before OpenAI) =====
    const { default: Stripe } = await import("stripe");
    const STRIPE_SK = (RUN_MODE === "prod") ? process.env.STRIPE_LIVE_SECRET : process.env.STRIPE_TEST_SECRET;
    $.export("run_mode", RUN_MODE);
    $.export("stripe_mode", STRIPE_SK?.startsWith("sk_live_") ? "live" : STRIPE_SK?.startsWith("sk_test_") ? "test" : "unset");

    const stripe = new Stripe(STRIPE_SK, { apiVersion: "2024-06-20" });
    const productKey = "fathom";
    const buyerEmail = sst.sub;
    const ck = `credits_${productKey}`;

    // find best customer (the one with credits)
    const custs = await stripe.customers.list({ email: buyerEmail, limit: 100 });
    if (!custs.data.length) return { success:false, error:"no_customer_for_email", email: buyerEmail, code:403 };

    let customer = null, current = 0;
    for (const c of custs.data) {
      const v = parseInt(c.metadata?.[ck] || "0", 10) || 0;
      if (v > current) { current = v; customer = c; }
    }
    if (!customer) customer = custs.data.sort((a,b)=>(b.updated||0)-(a.updated||0))[0];

    $.export("credits_probe", custs.data.map(c=>({id:c.id, credits: parseInt(c.metadata?.[ck]||"0",10)||0})));
    $.export("chosen_customer", { id: customer.id, email: customer.email, credits: current });
    $.export("credits_before", { email: buyerEmail, key: ck, current });

    if (current <= 0) return { success:false, error:"no_credits", key: ck, email: buyerEmail, code:403 };

    // keep context for decrement
    const __creditContext = { customerId: customer.id, key: ck, current };

    // ===== Generate path only =====
    try {
      // NOTE: prepare_prompt no longer returns `symptom`
      const { prompt, context, email } = steps.prepare_prompt.$return_value || {};

      if (!envOK) {
        return { success: false, error: "Missing OPENAI_API_KEY", card: null, context, email, path: "generate" };
      }
      if (!prompt) {
        return { success: false, error: "Missing prompt", card: null, context, email, path: "generate" };
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        temperature: 0.7,
        presence_penalty: 0.2,
        frequency_penalty: 0.1,
        max_tokens: 2800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are Fathom, a decoding intelligence. Return JSON only." },
          { role: "user", content: prompt }
        ]
      });

      const content = completion?.choices?.[0]?.message?.content;
      if (!content) {
        return { success: false, error: "No content from model", card: null, context, email, path: "generate" };
      }

      let card;
      $.export("raw_model_content", content.slice(0, 4000)); // view first 4k chars in logs

      try { card = JSON.parse(content); }
      catch {
        return { success: false, error: "Model did not return JSON", raw: content, card: null, context, email, path: "generate" };
      }

      const v = validateCard(card);
      v.missing.forEach(k => card[k] = card[k] || ""); // soft-fill so UI never breaks

      // 🔒 Always enforce the canonical disclaimer
      const DISCLAIMER = "This insight is informational only and not medical advice or a diagnosis. Fathom is a reflective tool and does not treat any condition.";
      card.disclaimer = DISCLAIMER;
      $.export("disclaimer_enforced", true);

      // Decrement one credit on success (don’t block user on failure)
      try {
        const newVal = Math.max(0, (__creditContext.current|0) - 1);
        await stripe.customers.update(__creditContext.customerId, { metadata: { [__creditContext.key]: String(newVal) }});
        $.export("credits_after", { email: buyerEmail, key: __creditContext.key, newValue: newVal });
      } catch (e) {
        $.export("decrement_error", String(e?.message||e));
      }

      // Do NOT return symptom or processedAt
      return { success: true, mode: "generate", card, context, email };
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      $.export("fathom_error", msg);
      return { success: false, error: msg, card: null };
    }
  }
});
