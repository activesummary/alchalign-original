export default defineComponent({
  async run({ steps, $ }) {
    // CORS / preflight
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "https://alchalign.com",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    };
    const allowedOrigins = [
  "https://alchalign.com",
  "https://www.alchalign.com"
];
const origin = steps.trigger?.event?.headers?.origin || "";
headers["Access-Control-Allow-Origin"] = allowedOrigins.includes(origin) ? origin : "https://alchalign.com";

    const method = String(
      steps.trigger?.event?.method ||
      steps.trigger?.event?.http?.method ||
      steps.trigger?.event?.headers?.[":method"] ||
      ""
    ).toUpperCase();
    if (method === "OPTIONS") {
      await $.respond({ status: 204, headers, body: "" });
      return { responded: true, status: 204 };
    }

    // Read normalized generate output
    let r = steps.custom_request?.$return_value || {};

    // Fallback: if not normalized, try to extract plan from raw OpenAI content
    if (!r.plan) {
      const content = steps.custom_request?.$return_value?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) {
        // try JSON first
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed.plan === "string") r = { ...r, plan: parsed.plan };
        } catch { /* ignore */ }
        if (!r.plan) r.plan = content.trim();
      }
    }

    const hasPlan = typeof r.plan === "string" && r.plan.length > 0;
    const isSuccess = (r.success === true) || hasPlan;
    const status = isSuccess ? 200 : (Number.isInteger(r.code) ? r.code : 400);

    await $.respond({
      status,
      headers,
      body: JSON.stringify({
        success: !!isSuccess,
        plan: hasPlan ? r.plan : null,
        error: r.error || null,
        code: r.code ?? undefined,
        version: r.version || undefined,
        warning: r.warning || undefined,
        meta: r.meta || undefined,
      }),
    });

    return { responded: true, status };
  }
});
