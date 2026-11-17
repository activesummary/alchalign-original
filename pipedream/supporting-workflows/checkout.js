export default defineComponent({
  async run({ steps, $ }) {
    const RUN_MODE = process.env.RUN_MODE || "dev";
    const { default: Stripe } = await import("stripe");
    const STRIPE_SECRET =
      RUN_MODE === "prod" ? process.env.STRIPE_LIVE_SECRET : process.env.STRIPE_TEST_SECRET;
    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20" });

    // --- auth (require secret) ---
    const headers   = steps.trigger?.event?.headers || {};
    const bearer    = (headers.authorization || "").replace(/^Bearer\s+/i, "");
    const fromProxy = bearer && bearer === process.env.AA_PD_SHARED_SECRET;
    if (!fromProxy) {
      return $.respond({
        status: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "unauthorized" }),
      });
    }

    // --- body/query ---
    let payload = {};
    const rawBody = steps.trigger?.event?.body;
    if (rawBody) {
      if (typeof rawBody === "object") payload = rawBody;
      else { try { payload = JSON.parse(String(rawBody)); } catch {} }
    }
    const query = steps.trigger?.event?.query || {};
    const q = Object.keys(payload).length ? payload : query;

    // --- inputs ---
    const rawProduct = (q.product || "").toString().trim().toLowerCase();
    const origin     = (q.origin || "https://alchalign.com").toString(); // for metadata/logs

    // map product -> price id
    const MAP = RUN_MODE === "prod"
      ? {
          fathom:           { price: "price_ARCHIVED_REDACTED_01", mode: "payment" },
          sliproot:         { price: "price_ARCHIVED_REDACTED_02", mode: "payment" },
          alignmentscan:    { price: "price_ARCHIVED_REDACTED_03", mode: "payment" },
          aligndaily:       { price: "price_ARCHIVED_REDACTED_04", mode: "payment" },
          alchalignbundle:  { price: "price_ARCHIVED_REDACTED_05", mode: "payment" },
        }
      : {
          fathom:           { price: "price_ARCHIVED_REDACTED_06", mode: "payment" },
          sliproot:         { price: "price_ARCHIVED_REDACTED_07", mode: "payment" },
          alignmentscan:    { price: "price_ARCHIVED_REDACTED_08", mode: "payment" },
          aligndaily:       { price: "price_ARCHIVED_REDACTED_09", mode: "payment" },
          alchalignbundle:  { price: "price_ARCHIVED_REDACTED_10", mode: "payment" },
        };

    const mapItem = MAP[rawProduct];
    if (!mapItem) {
      return $.respond({
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "bad_product", got: rawProduct }),
      });
    }

    // 🔒 Force your slugs: /thank-you and /cancel (and keep ?session_id=)
    const success_url = `https://alchalign.com/thank-you?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url  = `https://alchalign.com/cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: mapItem.mode || "payment",
      line_items: [{ price: mapItem.price, quantity: 1 }],
      success_url,
      cancel_url,
      allow_promotion_codes: true,
      metadata: { product_key: rawProduct, run_mode: RUN_MODE, source: "buy-proxy", origin },
    });

    // Proxy call → JSON response; WP does the 303
    return $.respond({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    });
  },
});
