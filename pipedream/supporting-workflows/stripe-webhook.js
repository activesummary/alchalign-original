export default defineComponent({
  async run({ steps, $ }) {
    const RUN_MODE     = process.env.RUN_MODE || "dev";
    const STRIPE_SK    = RUN_MODE === "prod" ? process.env.STRIPE_LIVE_SECRET : process.env.STRIPE_TEST_SECRET;
    const WH_SECRET    = RUN_MODE === "prod" ? process.env.STRIPE_LIVE_WEBHOOK_SECRET : process.env.STRIPE_TEST_WEBHOOK_SECRET;
    const BASE_URL     = process.env.BASE_URL || "https://alchalign.com";
    const CLAIM_SECRET = process.env.CLAIM_SECRET;
    const RESEND_KEY   = process.env.RESEND_API_KEY;

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(STRIPE_SK, { apiVersion: "2024-06-20" });
    const crypto = await import("crypto");

    // --- helpers ---
    const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    const sign = (data) => b64u(crypto.createHmac("sha256", CLAIM_SECRET).update(data).digest());
    function mintToken(payload){ const data=b64u(JSON.stringify(payload)); return `v1.${data}.${sign(data)}`; }

    function canonKey(s){
      const k = String(s||"").toLowerCase().trim().replace(/[\s_-]+/g,"");
      if (["alignmentscan","alignscan","alignment scan","align-scan"].includes(k)) return "alignmentscan";
      if (["aligndaily","daily"].includes(k)) return "aligndaily";
      if (["sliproot"].includes(k)) return "sliproot";
      if (["fathom"].includes(k)) return "fathom";
      if (["alchalignbundle", "bundle"].includes(k)) return "alchalignbundle";
      return k;
    }
  
const BUNDLES = {
  alchalignbundle: ["fathom", "sliproot", "aligndaily", "alignmentscan"],
};

        async function sendMagicEmail(toEmail, products, sid) {
      try {
        const token = mintToken({
          sub: toEmail,
          products: Array.from(new Set(products)).map(p => String(p).toLowerCase()),
          sid: sid || null,
          mode: RUN_MODE,
          exp: Math.floor(Date.now() / 1000) + 60 * 60, // 60 minutes
          n: crypto.randomBytes(8).toString("hex"),
        });

        // debug: short fingerprint
        $.export(
          "magic_token_fp",
          token.split(".")[2]?.slice(0, 8) + "…" + token.slice(-8)
        );

        const url = `${BASE_URL}/claim?token=${encodeURIComponent(token)}`;
        const subject = "Your alchAlign access link";

        const text = [
          "Thank you for your purchase.",
          "",
          "Here’s your secure link to activate your alchAlign tools.",
          "This link will be valid for the next 60 minutes.",
          "",
          url,
          "",
          "If you didn’t request this email, you can safely ignore it."
        ].join("\n");

        const html = `
<div style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="background:#ffffff;border-radius:24px;padding:32px 28px 28px;box-shadow:0 22px 45px rgba(15,23,42,0.16);">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;text-align:center;color:#9ca3af;">
        ACCESS FOR
      </p>
      <h1 style="margin:0 0 4px;font-size:26px;letter-spacing:0.16em;text-transform:uppercase;text-align:center;color:#111827;">
        ALCHALIGN
      </h1>
      <p style="margin:0 0 24px;font-size:13px;text-align:center;color:#9ca3af;">
        Secure one-click sign-in
      </p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;">

      <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#374151;">
        Thank you for your purchase.
      </p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#4b5563;">
        Here’s your secure link to activate your alchAlign tools.
        This link will be valid for the next <strong>60 minutes</strong>.
      </p>

      <div style="text-align:center;margin:0 0 24px;">
        <a href="${url}"
           style="display:inline-block;padding:10px 24px;border-radius:999px;background:#111827;color:#f9fafb;font-size:14px;font-weight:600;text-decoration:none;">
          Sign-in
        </a>
      </div>

      <p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:#6b7280;">
        If the button above doesn’t work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 18px;font-size:11px;line-height:1.5;color:#9ca3af;word-break:break-all;">
        ${url}
      </p>

      <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">
        If you didn’t request this email, you can safely ignore it.
      </p>
      <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#d1d5db;">
        This is a one-time transactional message about your alchAlign account.
      </p>
    </div>
  </div>
</div>`.trim();

        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: "alchAlign <no-reply@alchalign.com>",
            to: [toEmail],
            subject,
            html,
            text,
          }),
        });

        if (!resp.ok) {
          $.export("resend_error", await resp.text().catch(() => resp.statusText));
        }
      } catch (e) {
        $.export("resend_exception", e?.message || String(e));
      }
    }


    // --- main fulfillment (idempotent, canonical keys, email guard) ---
    async function handleCheckoutSession(sessId, eventId) {
      const session = await stripe.checkout.sessions.retrieve(sessId, {
        expand: ["line_items.data.price.product", "customer"],
      });

      const paid = session.payment_status === "paid" || session.status === "complete";
      if (!paid) return { ok:false, reason:"not_paid" };

      // who to email
      const email =
        session.customer_details?.email ||
        session.customer_email ||
        session.customer?.email ||
        null;

      // resolve / create customer to store credits
      let customerId = session.customer?.id || session.customer || null;
      if (!customerId && email) {
        const c = await stripe.customers.list({ email, limit: 1 });
        customerId = c.data.length ? c.data[0].id : (await stripe.customers.create({ email })).id;
      }
      if (!customerId) return { ok:false, reason:"no_customer", email };

      // fetch current customer metadata once
      const customer = await stripe.customers.retrieve(customerId);

      // 🛡️ idempotency: fulfill once per checkout session
      if (customer.metadata?.last_checkout_session === session.id) {
        return { ok:true, deduped:true, sessionId: session.id, email };
      }

// quantities by canonical key
const qty = {};
for (const li of session?.line_items?.data || []) {
  const prod = li?.price?.product;
  const rawKey =
    prod?.metadata?.product_key ||
    li?.price?.metadata?.product_key ||
    li?.price?.nickname ||
    prod?.name ||
    li?.description ||
    "";

  const canon = canonKey(rawKey);
  const targets = BUNDLES[canon] || [canon];
  const count = li.quantity || 1;

  for (const k of targets) {
    qty[k] = (qty[k] || 0) + count;
  }
}

// Skip if no known tool products resolved
if (!qty || Object.keys(qty).length === 0) {
  $.export("skipped_no_tool_products", { session_id: session?.id });
  return { ok: true, skipped: "no_tool_products" };
}


      
// Guidance guard (definitive): check metadata + price IDs
const GUIDANCE_PRICES = new Set([
  "price_ARCHIVED_REDACTED_11", // Guidance (email)
  "price_ARCHIVED_REDACTED_12"  // Guidance (email+voice)
]);

const liList = Array.isArray(session?.line_items?.data) ? session.line_items.data : [];
const liPriceIds = liList.map(li => li?.price?.id).filter(Boolean);

const isGuidanceSession =
  session?.metadata?.product_type === "guidance" ||
  liPriceIds.some(id => GUIDANCE_PRICES.has(id));

if (isGuidanceSession) {
  $.export("skipped_guidance", { session_id: session.id, email, liPriceIds });
  return { ok: true, skipped: "guidance" };
}

// If no tool SKUs resolved, don’t grant credits / email
if (!qty || Object.keys(qty).length === 0) {
  $.export("skipped_no_tool_products", { session_id: session.id });
  return { ok: true, skipped: "no_tool_products" };
}

      
      // apply credit increments: metadata credits_<key> = number
      const md = { ...(customer.metadata || {}) };
      for (const [k, inc] of Object.entries(qty)) {
        const mkey = `credits_${k}`;
        const cur = parseInt(md[mkey] || "0", 10) || 0;
        md[mkey] = String(cur + inc);
      }
      md.last_checkout_session = session.id;

      await stripe.customers.update(customerId, { metadata: md });
      $.export("credits_update", { customerId, email, qty, metadata: md });


      
// 📧 email-on-webhook with guard (once per event; THROTTLE)
if (email && Object.keys(qty).length > 0) {
  const lastEvent = customer.metadata?.last_magic_event_id || "";
  const lastTs = parseInt(customer.metadata?.last_magic_sent_ts || "0", 10) || 0;
  const now = Date.now();
  const THROTTLE_MS = Number(process.env.MAGIC_THROTTLE_MS ?? (5 * 60 * 1000));

  if (eventId !== lastEvent && (now - lastTs > THROTTLE_MS)) {
    $.export("debug_qty", qty);
    await sendMagicEmail(email, Object.keys(qty), session.id); // ✅ clean call
    await stripe.customers.update(customerId, {
      metadata: {
        last_magic_event_id: eventId,
        last_magic_session_id: session.id,
        last_magic_sent_ts: String(now),
      }
    });
    $.export("magic_email", { sent: true, to: email, session: session.id, eventId });
  } else {
    $.export("magic_email", {
      sent: false,
      reason: (eventId === lastEvent ? "duplicate_event" : "throttled"),
      last_event: lastEvent,
      last_sent_at: lastTs,
      now,
      throttle_ms: THROTTLE_MS
    });
  }
} else {
  $.export("magic_email", { sent: false, reason: "no_email_or_empty_qty" });
}

      
return { ok: true, email, products: Object.keys(qty) };
    }


    
// ---- Robust Stripe header + signature extraction ----
function findHeaderSig(hdrsAny) {
  if (!hdrsAny) return "";
  // Object form: { 'stripe-signature': 't=...,v1=...' }
  if (!Array.isArray(hdrsAny) && typeof hdrsAny === "object") {
    for (const [k, v] of Object.entries(hdrsAny)) {
      if (/^stripe-signature$/i.test(String(k))) return String(v);
    }
    return "";
  }
  // Array form
  for (const row of hdrsAny) {
    if (!row) continue;
    // ["Stripe-Signature", "t=..., v1=..."]
    if (Array.isArray(row) && row.length >= 2 && /^stripe-signature$/i.test(String(row[0]))) {
      return String(row[1]);
    }
    // { name: "Stripe-Signature", value: "t=..., v1=..." }
    if (typeof row === "object" && row.name && /^stripe-signature$/i.test(String(row.name))) {
      return String(row.value);
    }
    // "Stripe-Signature: t=..., v1=..."
    if (typeof row === "string") {
      const m = row.match(/^\s*stripe-signature\s*:\s*(.+)\s*$/i);
      if (m) return m[1].trim();
    }
  }

  // Last-ditch: value-only string that *looks* like a Stripe signature (t=..., v1=...)
  for (const row of hdrsAny) {
    if (typeof row === "string" && /(^|[,;]\s*)t=\d+/.test(row) && /\bv1=[0-9a-f]+/i.test(row)) {
      return row.trim();
    }
  }
  return "";
}

function collectHeaders() {
  const A = steps?.trigger?.event?.headers;
  const B = steps?.trigger?.raw_event?.headers;
  // prefer the one that yields a signature
  const sigA = findHeaderSig(A);
  const sigB = findHeaderSig(B);
  return sigA ? { sig: sigA, source: "event.headers", raw: A }
              : sigB ? { sig: sigB, source: "raw_event.headers", raw: B }
                     : { sig: "", source: "none", raw: A || B };
}

const { sig, source, raw: hdrsRaw } = collectHeaders();


// your webhook secret (accept both naming styles you used)
const WH =
  RUN_MODE === "prod"
    ? (process.env.STRIPE_LIVE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET_LIVE)
    : (process.env.STRIPE_TEST_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET_TEST);


$.export("debug_webhook_headers", {
  got_sig: !!sig, from: source, has_secret: !!WH,
  raw_type: Array.isArray(hdrsRaw) ? "array" : typeof hdrsRaw
});

if (!sig) { await $.respond({ status: 400, body: { ok:false, error:"missing_signature_header" } }); return; }
if (!WH)  { await $.respond({ status: 400, body: { ok:false, error:"missing_webhook_secret_env" } }); return; }


    
// ---- Strict verification using raw body (buffer or string) ----
const raw =
  steps?.trigger?.event?.raw_body  ??
  steps?.trigger?.event?.$raw_body ??
  steps?.trigger?.event?.$rawBody  ??
  steps?.trigger?.event?.bodyRaw   ??
  steps?.trigger?.raw_event?.body  ??
  steps?.trigger?.event?.body      ??
  "";

let event;
try {
  const stripeClient = (typeof stripe !== "undefined" && stripe?.webhooks)
    ? stripe
    : new (await import("stripe")).default(
        process.env.STRIPE_LIVE_SECRET ?? process.env.STRIPE_TEST_SECRET,
        { apiVersion: "2024-06-20" }
      );
  event = stripeClient.webhooks.constructEvent(raw, sig, WH);
} catch (err) {
  await $.respond({ status: 400, body: { ok:false, error:"invalid_signature" } });
  return;
}

try {
  switch (event.type) {
    case "checkout.session.completed":
case "checkout.session.async_payment_succeeded": {
  const session = event.data?.object || {};
  const sessId = session.id;
  if (sessId) {
    const result = await handleCheckoutSession(sessId, event.id);
    $.export("handled_checkout", result);
  } else {
    $.export("missing_session_id", true);
  }
  break;
}

    default: {
      $.export("ignored_event", event.type);
      break;
    }
  }
} catch (e) {
  $.export("webhook_handler_error", e?.message || String(e));
}

await $.respond({ status: 200, body: "ok" });
return;
    
  } // <- end run
}); // <- end defineComponent
