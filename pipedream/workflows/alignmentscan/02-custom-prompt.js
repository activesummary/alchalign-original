// ===== Imports must be at the very top =====
import axios from "axios";
import { jwtVerify } from "jose"; // supports future per-tool JWTs

export default defineComponent({
  props: { prompt: { type: "string" } },
  async run({ steps, $ }) {
    // ===== Config =====
    const ORIGIN          = "https://alchalign.com";           // TODO: your site origin
    const RUN_MODE        = process.env.RUN_MODE || "dev";
    const CLAIM_SECRET    = process.env.CLAIM_SECRET;          // for legacy aa_session (v1)
    const JWT_SECRET_RAW  = process.env.JWT_SECRET || "";      // for JWT (optional now)
    const JWT_SECRET_KEY  = JWT_SECRET_RAW ? new TextEncoder().encode(JWT_SECRET_RAW) : null;

    const REQUIRED_TOOL   = "alignmentscan";                   // this tool’s key
    const PROD_ALIASES    = ["alignmentscan", "alignment-scan", "alignmentScan"];

   
    // ===== Small helpers =====
    const cors = async (status, bodyObj = {}) => {
  // Base metadata for all CORS responses
  const base = {
    code: status,
    success: status >= 200 && status < 300, // caller can override with success:false
  };

  const payload = { ...base, ...bodyObj };

  await $.respond({
    status,
    headers: {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AA-Token, X-AA-JobId",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  // Step return value (safe, non-circular)
  return payload;
};

    const safeJson = (v) => {
      if (!v) return {};
      if (typeof v === "object") return v;
      try { return JSON.parse(v); } catch { return {}; }
    };
    const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    const b64d = (txt) => Buffer.from(txt.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString();
    const isV1Session = (t) => typeof t === "string" && t.startsWith("v1.");
    const norm = (x) => String(x || "").trim();

   
   // ===== 0) CORS preflight =====
   const evt = steps.trigger?.event || {};
   if ((evt.method || "").toUpperCase() === "OPTIONS") {
   await $.respond({
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AA-Token, X-AA-JobId",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: ""
   });
   return { responded: true, code: 204, success: true };
  }

    // ===== 1) Find an auth token =====
const hdrs = evt.headers || {};
const authHeader = hdrs.authorization || hdrs.Authorization || "";
let token =
  (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1] ||
  hdrs["x-aa-token"] || hdrs["X-AA-Token"] || null;

// Cookie: aa_session=...
if (!token) {
  const cookie = hdrs.cookie || "";
  const m = cookie.match(/(?:^|;\s*)aa_session=([^;]+)/);
  if (m) token = decodeURIComponent(m[1]);
}

// Body: { aa_session: "..." }
if (!token) {
  const ct = String(hdrs["content-type"] || "").toLowerCase();
  const body = ct.includes("application/json") ? (evt.body_json || safeJson(evt.body)) : {};
  if (body && body.aa_session) token = body.aa_session;
}

// Query: ?aa_token=...
if (!token) {
  const q = evt.query || {};
  if (q.aa_token) token = q.aa_token;
}

if (!token) return cors(401, { success: false, error: "not_logged_in" });



    
    // ===== 2) AUTH: accept EITHER aa_session (v1) OR a per-tool JWT =====
    let authMode = null;   // "session" | "jwt"
    let userEmail = null;
    let products = [];     // for session mode: array; for jwt mode: [tool]

    if (isV1Session(token)) {
      // --- Legacy aa_session (HMAC) ---
      const [v, data, sig] = token.split(".");
      if (v !== "v1" || !data || !sig) return cors(400, { success: false, error: "bad_token" });

      const { default: cryptoMod } = await import("crypto");
      const crypto = cryptoMod;
      const expectedSig = b64u(crypto.createHmac("sha256", CLAIM_SECRET).update(data).digest());
      if (expectedSig !== sig) return cors(401, { success: false, error: "bad_sig" });

      const sst = JSON.parse(b64d(data));
      if (sst.exp && sst.exp < Math.floor(Date.now() / 1000)) return cors(401, { success: false, error: "expired" });

      userEmail = norm(sst.sub);
      products  = Array.isArray(sst.products) ? sst.products.map(String) : [];
      authMode  = "session";

    } else if (JWT_SECRET_KEY) {
      // --- Per-tool JWT (optional path; enabled when JWT_SECRET is set) ---
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET_KEY, {
          issuer: "alchalign",
          audience: "alchalign.tools",
        });
        userEmail = norm(payload.sub);
        products  = [String(payload.tool || "")]; // single tool in JWT
        authMode  = "jwt";
      } catch (e) {
        return cors(403, { success: false, error: "Click the access link in your email to check credits.", hint: e.message });
      }
    } else {
      // No JWT secret configured and token wasn't v1 → reject
      return cors(403, { success: false, error: "Click the access link in your email to check credits." });
    }

    if (!userEmail) return cors(400, { success: false, error: "no_email_in_token" });
    $.export("user_email", userEmail);

   
    
// ===== 3) Product hint (non-blocking) =====
// Keep for telemetry; do NOT gate on token contents.
$.export("token_products_hint", { mode: authMode, products });

    
    // ===== 4) Stripe credits check =====
    const STRIPE_SK = RUN_MODE === "prod" ? process.env.STRIPE_LIVE_SECRET : process.env.STRIPE_TEST_SECRET;
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(STRIPE_SK, { apiVersion: "2024-06-20" });

    const custs = await stripe.customers.list({ email: userEmail, limit: 1 });
    if (!custs.data.length) return cors(403, { success: false, error: "no_customer" });
    const customer = custs.data[0];

    const creditKeys = PROD_ALIASES.map(k => `credits_${k}`);
    let creditsKeyUsed = null;
    let current = 0;
    for (const key of creditKeys) {
      const v = customer.metadata?.[key];
      if (v != null && v !== "") { creditsKeyUsed = key; current = parseInt(v, 10) || 0; break; }
    }
    if (!creditsKeyUsed) creditsKeyUsed = "credits_alignmentscan";
    if (current <= 0) {
      return cors(403, { success: false, error: "no_credits", note: { checked: creditKeys } });
    }

    // idempotent decrement helper
    async function decrementCredit(idemKey) {
      try {
        await stripe.customers.update(
          customer.id,
          { metadata: { [creditsKeyUsed]: String(current - 1) } },
          { idempotencyKey: String(idemKey) }
        );
        return true;
      } catch (e) {
        console.warn("decrement failed:", e?.message || e);
        return false;
      }
    }

    // ===== 4.5) Guard: ensure we actually have a prompt =====
    const promptText = String(this.prompt || "").trim();
    if (!promptText) {
      return cors(400, {
        success: false,
        error: "empty_prompt",
        detail: "No prompt text was provided to custom_prompt."
      });
    }

    // ===== 5) Generate first (don’t return yet) =====
    const body = evt.body_json || safeJson(evt.body);
    const jobId =
      body.jobId ||
      hdrs["x-aa-jobid"] ||
      (await (await import("crypto")).randomUUID());

    let finalResponse = null;
    let raw = "";

    // Debug stage marker: before OpenAI call
    $.export("dbg_stage", "before_openai_call");

    try {
      const completion = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4.1",
          messages: [
            {
              role: "system",
              content:
                'You are the Alignment Tool. Return only clean JSON in the format: { "html": "<h2>...</h2>" }'
            },
            { role: "user", content: promptText },
          ],
          temperature: 0.8,
          presence_penalty: 0.25,
          frequency_penalty: 0.1
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          // Keep this safely under any Pipedream step limit
          timeout: 300000, // 300s
        }
      );

      // Debug stage marker: after OpenAI call
      $.export("dbg_stage", "after_openai_call");

      raw = completion.data?.choices?.[0]?.message?.content || "";

      if (!raw || typeof raw !== "string") {
        return cors(502, {
          success: false,
          error: "empty_completion",
          detail: "OpenAI returned no message content"
        });
      }

      try {
        const parsed = JSON.parse(raw);
        const wordCount = raw.trim().split(/\s+/).length;
        if (wordCount < 400) {
          console.warn("⚠️ Short output (" + wordCount + " words).");
        }
        finalResponse = parsed; // expected: { html: "<h2>...</h2>..." }
      } catch {
        // Treat non-JSON (but present) output as success with a warning
        finalResponse = {
          html: raw,
          warning: "Returned unparsed HTML due to formatting issue."
        };
      }
    } catch (e) {
      // If we get here, OpenAI failed or timed out → log and bail clearly
      $.export("dbg_stage", "openai_error");
      $.export("openai_error", String(e?.message || e));

      return cors(502, {
        success: false,
        error: "generation_failed",
        detail: String(e?.message || e)
      });
    }
    
    // ===== 6) Decrement now; only deliver on success =====
    const decOK = await decrementCredit(jobId);
    if (!decOK) {
      return cors(409, {
        success: false,
        error: "billing_failed",
        retryable: true,
        jobId
      });
    }

    // ===== 7) Billing OK → deliver report in a stable envelope =====
    const htmlString =
      finalResponse && typeof finalResponse.html === "string"
        ? finalResponse.html
        : typeof finalResponse === "string"
        ? finalResponse
        : "";

    const payload = {
    success: true,
    code: 200,
    guide: { html: htmlString },
    warning: finalResponse?.warning || undefined,
    version: "v1"
   };

    $.export("$summary", `Alignment Scan generated (HTML length: ${htmlString.length})`);
    $.export("job_id", jobId);
    $.export("user_email", userEmail);
    $.export("credits_key_used", creditsKeyUsed);
    $.export("credits_before", current);
    $.export("credits_after", current - 1);

    await $.respond({
    status: 200,
    headers: {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AA-Token, X-AA-JobId",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "content-type": "application/json"
    },
    body: JSON.stringify(payload)
   });

// Step return value is plain and safe
return payload;
  },
});
