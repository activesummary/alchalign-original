export default defineComponent({
  async run({ steps, $ }) {
    const ev = steps.trigger?.event || {};
    const hdrs = ev.headers || {};
    const method = String(ev.http?.method || ev.method || "").toUpperCase();

    // Allowed origins for the frontend calling this endpoint
    const allowed = [
      "https://alchalign.com",
      "https://www.alchalign.com",
      // "http://localhost:3000", // <- uncomment for local dev
    ];
    const origin = hdrs.origin || hdrs.Origin || "";
    const corsOrigin = allowed.includes(origin) ? origin : "https://alchalign.com";

    const acrHeaders =
      hdrs["access-control-request-headers"] ||
      hdrs["Access-Control-Request-Headers"] ||
      "Authorization, Content-Type";

    const CORS = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Headers": acrHeaders,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    if (method === "OPTIONS") {
      await $.respond({ status: 204, headers: CORS, body: "" });
      return { responded: true };
    }

    return { responded: false, corsOrigin, acrHeaders };
  }
});
