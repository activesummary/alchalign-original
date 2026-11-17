export default defineComponent({
  async run({ steps, $ }) {

    if (steps.preflight?.$return_value?.responded) {
      return { skipped: true, reason: "preflight" };
    }

    // 1) Pull the upstream result (from custom_prompt)
    const r = steps.custom_prompt?.$return_value || {};

    // 2) Decide status
    const status = r?.success ? 200 : (Number.isInteger(r?.code) ? r.code : 400);

    // 3) CORS setup (reflect only from allowed origins)
    const ev = steps.trigger?.event || {};
    const reqHeaders = ev.headers || {};
    const origin = reqHeaders.origin || reqHeaders.Origin || "";
    const allowedOrigins = [
      "https://alchalign.com",
      "https://www.alchalign.com",
      // "http://localhost:3000",
    ];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : "https://alchalign.com";

    const acrHeaders =
      reqHeaders["access-control-request-headers"] ||
      reqHeaders["Access-Control-Request-Headers"] ||
      "Authorization, Content-Type";

    const CORS = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Headers": acrHeaders,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",
    };

    // 4) Handle preflight early
    const method = String(
      ev.method || ev.http?.method || reqHeaders[":method"] || ""
    ).toUpperCase();

    if (method === "OPTIONS") {
      await $.respond({
        status: 204,
        headers: { ...CORS, "Access-Control-Max-Age": "86400" },
        body: ""
      });
      return { responded: true, status: 204 };
    }

    // 5) Build payload (no symptom, no processedAt)
    const payload = {
      success: !!r.success,
      card: r.card || null,
      error: r.error || null,
      hint: r.hint || null,
      code: r.code ?? undefined,
      meta: {
        // symptom removed by design
        context: r.context || "",
        email: r.email || "",
        mode: r.mode || "unknown",
        // Optional debug crumbs (only if custom_prompt returned them)
        run_mode: r.run_mode || undefined,
        stripe_mode: r.stripe_mode || undefined,
      },
    };

    // 6) Respond
    await $.respond({
      status,
      headers: {
        ...CORS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify(payload),
    });

    return { responded: true, status };
  }
});
