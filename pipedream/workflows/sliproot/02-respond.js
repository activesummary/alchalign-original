export default defineComponent({
  async run({ steps, $ }) {
    const origin =
  steps.trigger?.event?.headers?.origin ||
  steps.trigger?.event?.headers?.Origin ||
  "https://alchalign.com";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AA-Token, X-AA-Tool",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Vary": "Origin",
};


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

    const r = steps.generate_sliproot_v2?.$return_value || {};
    const hasCard = r && typeof r.card === "object";
    const isSuccess = (r.success === true) || hasCard;
    const status = isSuccess ? 200 : (Number.isInteger(r.code) ? r.code : 400);

    await $.respond({
      status,
      headers,
      body: JSON.stringify({
        success: !!isSuccess,
        card: hasCard ? r.card : null,
        error: r.error || null,
        code: r.code ?? undefined,
        version: r.version || undefined,
        warning: r.warning || undefined,
        meta: {
          symptom: r.symptom || r.pattern || "",
          context: r.context || "",
          email: r.email || "",
          mode: r.mode || "unknown",
        },
      }),
    });

    return { responded: true, status };
  }
});
