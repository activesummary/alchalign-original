export default defineComponent({
  async run({ steps, $ }) {
    $.export("claim_secret_fp", (process.env.CLAIM_SECRET || "").slice(0, 4) + "…" + (process.env.CLAIM_SECRET || "").slice(-4));

    // --- ENV ---
    const RUN_MODE     = process.env.RUN_MODE || "dev";
    const BASE_URL     = process.env.BASE_URL || "https://alchalign.com";
    const CLAIM_SECRET = process.env.CLAIM_SECRET;
    const RESEND_KEY   = process.env.RESEND_API_KEY;
    const STRIPE_SK    = RUN_MODE === "prod" ? process.env.STRIPE_LIVE_SECRET : process.env.STRIPE_TEST_SECRET;

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(STRIPE_SK, { apiVersion: "2024-06-20" });
    const crypto = await import("crypto");

    // ---- behavior flags / guards ----
    const ALLOW_CREDITS_IN_REDEEM = false;      // keep false: credits are granted only by the Stripe webhook
    const MAGIC_THROTTLE_MS       = 5 * 60 * 1000;    // 5-minute email resend throttle

    // --- CORS / Preflight ---
    const ORIGIN = steps.trigger.event.headers?.origin || "";
    const allowOrigin = ORIGIN && ORIGIN.includes("alchalign.com") ? ORIGIN : "*";
    const method = (steps.trigger.event.method || "").toUpperCase();
    const CORS = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
    };
    if (method === "OPTIONS") {
      return $.respond({ status: 204, headers: CORS, body: "" });
    }

    // If Stripe ever hits this endpoint by mistake, bail early
    if ((steps.trigger?.event?.headers || {})["stripe-signature"]) {
      return $.respond({ status: 400, headers: CORS, body: "wrong_endpoint" });
    }

    // --- helpers (safe base64url + HMAC that matches mint) ---
    const b64u = (buf) =>
      Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const b64d = (txt) => {
      let s = String(txt || "").replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      return Buffer.from(s, "base64").toString("utf8");
    };
    const hmac = (data) => b64u(crypto.createHmac("sha256", CLAIM_SECRET).update(data).digest());
    const mint = (payload) => {
      const data = b64u(JSON.stringify(payload));
      return `v1.${data}.${hmac(data)}`;
    };

    async function sessionToProducts(session) {
      const keys = {};
      for (const li of session?.line_items?.data || []) {
        const p = li?.price?.product;
        const key = (p?.metadata?.product_key || li?.price?.nickname || p?.name || "").toLowerCase();
        if (!key) continue;
        keys[key] = (keys[key] || 0) + (li.quantity || 1);
      }
      return keys; // { fathom: 1, ... }
    }

    async function upsertCredits(email, qtyMap) {
      if (!email || !Object.keys(qtyMap).length) return;
      // ensure a customer exists
      let customerId = null;
      const listed = await stripe.customers.list({ email, limit: 1 });
      if (listed.data.length) {
        customerId = listed.data[0].id;
      } else {
        const created = await stripe.customers.create({ email });
        customerId = created.id;
      }
      const customer = await stripe.customers.retrieve(customerId);
      const md = { ...(customer.metadata || {}) };
      for (const [product, inc] of Object.entries(qtyMap)) {
        const k = `credits_${product}`;
        const cur = parseInt(md[k] || "0", 10) || 0;
        md[k] = String(cur + inc);
      }
      await stripe.customers.update(customerId, { metadata: md });
      $.export("credits_update", { customerId, email, qty: qtyMap, metadata: md });
    }

       async function sendMagicEmail(toEmail, products, sid) {
    if (!toEmail) throw new Error("missing email");

    // throttle by Stripe customer metadata so webhook + AUTH can’t double-send
    let customer = (await stripe.customers.list({ email: toEmail, limit: 1 })).data[0] || null;
    if (!customer) customer = await stripe.customers.create({ email: toEmail, metadata: {} });

    const now = Date.now();
    const lastTs = parseInt(customer.metadata?.last_magic_sent_ts || "0", 10) || 0;
    const remaining = MAGIC_THROTTLE_MS - (now - lastTs);

    if (remaining > 0) {
      return {
        sent: false,
        reason: "throttled",
        retryAt: lastTs + MAGIC_THROTTLE_MS,
        retryInMs: remaining
      };
    }

    // use passed-in products directly (still stored in token)
    const cleanedProducts = Array.from(new Set(products))
      .map(p => String(p).toLowerCase().trim())
      .filter(Boolean);

    const token = mint({
      sub: toEmail,
      products: cleanedProducts,
      sid: sid || null,
      mode: RUN_MODE,
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
      n: crypto.randomBytes(8).toString("hex"),
    });

    const url = `${BASE_URL}/claim?token=${encodeURIComponent(token)}`;
    const sig = token.split(".")[2] || "";
    $.export("magic_token_fp", sig.slice(0, 8) + "…" + sig.slice(-8));

    // --- Simple polished HTML email (no glyph, no tools list) ---
    const html = `
<div style="background-color:#f5f7fb;padding:32px 0;">
  <div style="max-width:520px;margin:0 auto;background-color:#ffffff;border-radius:14px;padding:28px 32px;border:1px solid #e0e4ec;box-shadow:0 10px 30px rgba(15,23,42,0.06);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
    
    <div style="text-align:center;margin-bottom:12px;">
      <div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;color:#6b7280;">
        ACCESS FOR
      </div>
      <div style="font-size:24px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;color:#111827;margin-top:4px;">
        alchAlign
      </div>
      <div style="font-size:14px;color:#9ca3af;margin-top:4px;">
        Secure one-click sign-in
      </div>
    </div>

    <div style="height:1px;background:#e5e7eb;margin:18px 0 22px;"></div>

    <p style="font-size:16px;line-height:1.6;margin:0 0 12px;">
      Thank you for your purchase.
    </p>

    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
      Here’s your secure link to activate your alchAlign tools.
      This link will be valid for the next <strong>60 minutes</strong>.
    </p>

    <div style="text-align:center;margin:20px 0 22px;">
      <a href="${url}"
         style="display:inline-block;padding:11px 28px;font-size:14px;font-weight:600;border-radius:999px;text-decoration:none;background-color:#111827;color:#ffffff;">
        Sign-in
      </a>
    </div>

    <p style="font-size:13px;line-height:1.6;margin:0 0 8px;color:#4b5563;">
      If the button above doesn’t work, copy and paste this link into your browser:
    </p>

    <p style="font-size:12px;line-height:1.6;margin:0 0 18px;word-break:break-all;">
      <a href="${url}" style="color:#2563eb;text-decoration:underline;">${url}</a>
    </p>

    <p style="font-size:12px;line-height:1.5;margin:0 0 4px;color:#9ca3af;">
      If you didn’t request this email, you can safely ignore it.
    </p>
    <p style="font-size:12px;line-height:1.5;margin:0;color:#9ca3af;">
      This is a one-time transactional message about your alchAlign account.
    </p>

  </div>
</div>`.trim();

    const text = [
      "Here is your secure alchAlign access link.",
      url,
      "",
      "This link will be valid for the next 60 minutes.",
      "",
      "If you didn’t request this email, you can safely ignore it."
    ].join("\n");

    $.export("magic_email_preview", {
      toEmail,
      cleanedProducts,
      htmlSample: html.slice(0, 300) + "…"
    });

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: "alchAlign <support@alchalign.com>",
        to: [toEmail],
        subject: "Your alchAlign access link",
        html,
        text
      }),
    });

    if (!resp.ok) throw new Error(await resp.text().catch(() => resp.statusText));

    await stripe.customers.update(customer.id, {
      metadata: { last_magic_sent_ts: String(now) }
    });

    return { sent: true };
  }

    
    // --- inputs (robust) ---
    const ev = steps.trigger.event || {};
    const q = ev.query || {};

    // body (Pipedream may give JSON as a string)
    let b;
    try {
      b = typeof ev.body === "string" ? JSON.parse(ev.body || "{}") : (ev.body || {});
    } catch {
      b = {};
    }

    // derive action from query/body or from path (/auth/claim or /auth/redeem)
    const path = (ev.path || ev.raw_event?.path || "").toLowerCase();
    let action = String((q.action ?? b.action ?? "")).toLowerCase();
    if (!action) {
      const m = path.match(/\/(claim|redeem)\b/);
      if (m) action = m[1];
    }

    // helpful debug (shows what the endpoint actually received)
    $.export("auth_debug", {
      path,
      hasQuery: !!Object.keys(q).length,
      bodyType: typeof ev.body,
      action,
    });

    // ===== A) REDEEM (email magic link) =====

if (action === "redeem") {
  // email can come from body OR from an existing session token
  let email = String((b.email ?? q.email ?? "")).trim().toLowerCase();
  const sessionId = String((b.session_id ?? q.session_id ?? "")).trim();

  // allow email inference from existing aa_session
  const headers2  = steps.trigger.event.headers || {};
  const cookieStr = headers2.cookie || "";
  const bearerStr = headers2.authorization || "";
  const existingSession =
    (bearerStr.match(/^Bearer\s+(.+)$/i) || [])[1] ||
    (cookieStr.match(/(?:^|;\s*)aa_session=([^;]+)/) || [])[1] ||
    null;

  if (!email && existingSession) {
    try {
      const [v2, data2, sig2] = existingSession.split(".");
      if (sig2 === hmac(data2)) {
        const payload2 = JSON.parse(b64d(data2));
        if (!payload2.exp || payload2.exp >= Math.floor(Date.now() / 1000)) {
          email = String(payload2.sub || "").toLowerCase();
        }
      }
    } catch {}
  }

  if (!email && !sessionId) {
    return $.respond({ status: 400, headers: CORS, body: "Missing email" });
  }

  // helper: canonicalize the tool key
  function canonKey(s) {
    const k = String(s || "").toLowerCase().trim().replace(/[\s_-]+/g, "");
    if (["alignmentscan","alignscan","alignment scan","align-scan"].includes(k)) return "alignmentscan";
    if (["aligndaily","daily"].includes(k)) return "aligndaily";
    if (["sliproot"].includes(k)) return "sliproot";
    if (["fathom"].includes(k)) return "fathom";
    return k;
  }

  async function deriveProductsForEmail(emailAddr, sessId)                                          {
    const out = new Set();

    // A) Preferred: derive from THIS Checkout Session
    if (sessId) {
      const sess = await stripe.checkout.sessions
        .retrieve(sessId, { expand: ["line_items.data.price.product"] })
        .catch(() => null);

      for (const li of (sess?.line_items?.data || [])) {
        const prod   = li?.price?.product;
        const rawKey =
          prod?.metadata?.product_key ||
          li?.price?.metadata?.product_key ||
          li?.price?.nickname ||
          prod?.name ||
          li?.description ||
          "";
        const key = canonKey(rawKey);
        if (key) out.add(key);
      }
    }

    // B) Fallback: Stripe customer credits
    if (!out.size && emailAddr) {
      const custs = await stripe.customers.list({ email: emailAddr, limit: 1 });
      const cust  = custs.data[0];
      const md    = cust?.metadata || {};
      for (const [k, v] of Object.entries(md)) {
        const m = k.match(/^credits_(.+)$/);
        if (m && (parseInt(v, 10) || 0) > 0) out.add(canonKey(m[1]));
      }
    }

     const arr = Array.from(out);
     $.export("derived_products", arr);
     return arr;
    }

  // compute products
  let sid = "";
  let products = [];

  if (sessionId) {
    const s = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price.product", "customer"],
    });
    const paid = s.payment_status === "paid" || s.status === "complete";
    if (!paid) return $.respond({ status: 402, headers: CORS, body: "Payment not completed" });

    if (!email) {
      email = s.customer_details?.email || s.customer_email || s.customer?.email || email;
    }

    sid = s.id;
    products = await deriveProductsForEmail(email, sid);
  } else {
    products = await deriveProductsForEmail(email, "");
  }

  // send the email (explicit throttle handling)
  try {
    const result = await sendMagicEmail(email, products, sid);

    if (result && result.sent) {
      return $.respond({
        status: 200,
        headers: { ...CORS, "content-type": "application/json" },
        body: JSON.stringify({ ok: true, sent: true })
      });
    }

    if (result && result.reason === "throttled") {
      const resetTsMs = Number(result.retryAt || 0);  // ms epoch
      const resetTs   = Math.floor(resetTsMs / 1000); // seconds
      return $.respond({
        status: 202, // Accepted; not sent due to throttle
        headers: {
          ...CORS,
          "content-type": "application/json",
          "Retry-After": String(Math.max(1, Math.ceil((resetTsMs - Date.now()) / 1000))),
          "X-RateLimit-Reason": "magic_link_throttled",
          "X-RateLimit-Reset": String(resetTs)
        },
        body: JSON.stringify({
          ok: true,
          sent: false,
          reason: "throttled",
          retryAt: resetTsMs
        })
      });
    }

    // Fallback (shouldn't hit)
    return $.respond({
      status: 500,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "unknown_redeem_state" })
    });

  } catch (e) {
    return $.respond({
      status: 502,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "email_send_failed", message: String(e && (e.message || e)) })
    });
  }
} // end REDEEM

    // ===== B) CLAIM (verify token, mint 30-day session) =====
if (action === "claim") {
  const headers = { ...CORS, "content-type": "application/json" };

  try {
    const token = String((q.token ?? b.token ?? "")).trim();
    $.export("claim_input", { hasToken: !!token, len: token.length, head: token.slice(0, 12) });

    if (!CLAIM_SECRET) return $.respond({ status: 500, headers, body: JSON.stringify({ ok:false, error:"missing_claim_secret" }) });
    if (!token)        return $.respond({ status: 400, headers, body: JSON.stringify({ ok:false, error:"missing_token" }) });

    // v1.<payload>.<sig>
    const [v, data, sig] = token.split(".");
    if (v !== "v1" || !data || !sig) {
      return $.respond({ status: 400, headers, body: JSON.stringify({ ok:false, error:"bad_token" }) });
    }
    const expected = hmac(data);
    if (expected !== sig) {
      $.export("claim_sig_mismatch", { expected: expected.slice(0, 8), got: String(sig||"").slice(0, 8) });
      return $.respond({ status: 400, headers, body: JSON.stringify({ ok:false, error:"bad_signature" }) });
    }

    let payload;
    try { payload = JSON.parse(b64d(data)); }
    catch { return $.respond({ status: 400, headers, body: JSON.stringify({ ok:false, error:"bad_payload" }) }); }

    const now   = Math.floor(Date.now()/1000);
    if (payload.exp && payload.exp < now) {
      return $.respond({ status: 400, headers, body: JSON.stringify({ ok:false, error:"expired" }) });
    }

    const email = String(payload.sub || "").toLowerCase();
    const sid   = payload.sid || null;

    // --- normalize product keys ---
    function canonKey(s) {
      const k = String(s || "").toLowerCase().trim().replace(/[\s_-]+/g,"");
      if (["alignmentscan","alignscan"].includes(k)) return "alignmentscan";
      if (["aligndaily","daily"].includes(k))        return "aligndaily";
      if (["sliproot"].includes(k))                  return "sliproot";
      if (["fathom"].includes(k))                    return "fathom";
      return k;
    }

    const PRODUCT_KEYS = ["fathom","sliproot","aligndaily","alignmentscan"];
    const aliasMap = {
      alchalignbundle: ["fathom","sliproot","aligndaily","alignmentscan"],
      bundle_all:      ["fathom","sliproot","aligndaily","alignmentscan"],
    };

    // --- build products from checkout session + Stripe customer credits ---
    const out = new Set();
    let customerId = null;

    // (1) From the checkout session carried in the magic link (if present)
    if (sid) {
      const sess = await stripe.checkout.sessions
        .retrieve(sid, { expand: ["line_items.data.price.product","customer"] })
        .catch(() => null);

      if (sess?.customer) customerId = typeof sess.customer === "string" ? sess.customer : sess.customer.id;

      for (const li of (sess?.line_items?.data || [])) {
        const prod   = li?.price?.product;
        const rawKey =
          prod?.metadata?.product_key ||
          li?.price?.metadata?.product_key ||
          li?.price?.nickname ||
          prod?.name ||
          li?.description || "";
        const key = canonKey(rawKey);
        if (key) out.add(key);
      }
    }

    // (2) From Stripe customer metadata (credits_* and bundle flags)
    let customer = null;
    if (!customerId && email) {
      const custs = await stripe.customers.list({ email, limit: 100 });
      customer = custs.data.sort((a,b)=>(b.updated||0)-(a.updated||0))[0] || null;
      if (customer) customerId = customer.id;
    }
    if (customerId && !customer) {
      try { customer = await stripe.customers.retrieve(customerId); } catch {}
    }

    if (customer) {
      const md = customer.metadata || {};
      for (const p of PRODUCT_KEYS) {
        const v = parseInt(md[`credits_${p}`] || "0", 10) || 0;
        if (v > 0) out.add(p);
      }
      for (const [k, list] of Object.entries(aliasMap)) {
        const flag = String(md[k] || "").toLowerCase();
        if (flag === "true" || flag === "1") list.forEach(x => out.add(x));
      }
    }

    // (3) Fallback to token’s own products if nothing else
    const tokenProducts = Array.isArray(payload.products) ? payload.products.map(x => canonKey(x)) : [];
    if (!out.size && tokenProducts.length) tokenProducts.forEach(x => x && out.add(x));

    const products = Array.from(out);
    $.export("claim_products_final", { products, tokenProducts, customerId });

    // --- mint 30-day session including products + customer_id ---
    const sessionToken = mint({
      sub: email,
      customer_id: customerId || null,
      products,
      mode: RUN_MODE,
      iat: now,
      exp: now + 60*60*24*30
    });

    $.export("claim_ok", { sub: email, products });

    return $.respond({
      status: 200,
      headers,
      body: JSON.stringify({ ok: true, session: sessionToken, email, products })
    });

  } catch (e) {
    $.export("claim_uncaught", String(e && (e.message || e)));
    return $.respond({
      status: 500,
      headers,
      body: JSON.stringify({ ok:false, error:"workflow_error", message: String(e && (e.message || e)) })
    });
  }
} // end CLAIM

    }, // end run
}); // end defineComponent
