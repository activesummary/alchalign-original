import juice from "juice";

export default defineComponent({
  async run({ steps, $ }) {

    // =============== THEME ===============
    const THEME = {
      productName: "Sliproot",
      header: "Your Sliproot Insight",
      glyph: "✺",
      accent: "#2E7D6A",
      glyphDiameter: 72,
      glyphFontSize: 32,
      haloBg: "linear-gradient(135deg,#DDEBE5,#EEF6F3)",
      glyphColor: "#1F6D61",
      wrapperMax: 760,
      viewUrl: "https://alchalign.com/sliproot-message"
    };

    // =============== CSS (inlined later) ===============
    function sharedStyles() {
      return `
/* Container / card */
.sliproot-card{max-width:760px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E2CF;border-radius:18px;padding:18px 22px 22px;box-shadow:0 8px 24px rgba(0,0,0,.04);}
.sliproot-card,.sliproot-card p,.sliproot-card li{color:#1F2A2E;font-family:Verdana,Geneva,sans-serif !important;font-size:14px;line-height:1.7;}
/* Header */
.sr-head{text-align:center;padding:24px 20px 12px;}
.headline-divider{border:0;border-top:2px solid ${THEME.accent};margin:12px auto 4px;width:64px;}
/* Sections */
.sliproot-card .sr-body{margin-top:6px;}
.sliproot-card .sr-section{
  background:#F3FAF7;
  border:1px solid #D9EAE3;
  border-radius:14px;
  padding:14px 16px;
  margin:12px 0;
}
.sliproot-card .sr-section h2{
  font-size:15.5px;font-weight:700;letter-spacing:.2px;
  color:${THEME.accent};
  margin:0 0 8px;
  border-bottom:1px solid #E4EFEA;
  padding-bottom:6px;
}
.sliproot-card .sr-section .content{font-size:14.5px;line-height:1.75;color:#223132;}
/* Footer */
#sr-footer{max-width:760px;margin:14px auto 0;padding:0 2px;font-family:Verdana,Geneva,sans-serif !important;color:#44565A;}
#sr-footer .sr-divider{border:0;border-top:1px solid #E8E6E0;margin:16px 0}
#sr-footer .sr-disclaimer{text-align:center;margin:0 0 8px;}
#sr-footer .sr-more{margin:0}
#sr-footer a{color:${THEME.accent};text-decoration:none;border-bottom:1px solid #CDE7E0;}
#sr-footer a:hover{text-decoration:underline;}
      `.trim();
    }

    // =============== HELPERS ===============
    const escapeHtml = (s = "") =>
      String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

    function paraHTML(t = "") {
      return t && String(t).trim()
        ? escapeHtml(String(t)).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")
        : "";
    }

    function extractCard(any) {
      let c = any || {};
      if (c && typeof c === "object" && c.card) c = c.card;
      if (c && typeof c === "object" && c.data?.card) c = c.data.card;
      return c || {};
    }

    // Section with heading
    function srSection(title, body) {
      if (!body || !String(body).trim()) return "";
      return `
        <div class="sr-section">
          <h2>${escapeHtml(title)}</h2>
          <div class="content">${paraHTML(body)}</div>
        </div>`;
    }

    function sharedHeader(theme = THEME) {
      return `
      <div class="sr-head">
        <div style="
          display:inline-block;
          width:${theme.glyphDiameter}px;
          height:${theme.glyphDiameter}px;
          line-height:${theme.glyphDiameter}px;
          border-radius:50%;
          background:${theme.haloBg};
          text-align:center;
          margin:0 auto 10px;
          font-size:${theme.glyphFontSize}px;
          font-weight:700;
          color:${theme.glyphColor};
          font-family:'Segoe UI Symbol','Apple Color Emoji','Noto Color Emoji',Arial,sans-serif;">
          ${escapeHtml(theme.glyph)}
        </div>
        <h1 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1A1F22;font-family:Verdana,Geneva,sans-serif;">
          ${escapeHtml(theme.header)}
        </h1>
        <hr class="headline-divider">
      </div>`.trim();
    }

    function emailShell({ title, preheader, innerHTML, viewUrl }) {
      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${escapeHtml(title)}</title>
  <style>${sharedStyles()}</style>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;">
  <div style="display:none!important;opacity:0;height:0;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(preheader || "")}
  </div>
  <center style="width:100%;background:#F3F4F6;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr><td align="center" style="padding:24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="${THEME.wrapperMax}"
               style="width:100%;max-width:${THEME.wrapperMax}px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:12px 18px; font:13px/18px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#6b7280;">
              <span style="float:right;"><a href="${escapeHtml(viewUrl)}" style="color:#6b7280;">View online</a></span>
              alchAlign • ${escapeHtml(THEME.productName)}
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              ${innerHTML}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 18px 18px; font:12px/18px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#6b7280;"">
              alchAlign — You’re receiving this because you requested a copy of your report.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </center>
</body>
</html>`;
    }

    function buildSliprootEmailHTML({ card = {} }) {
      const ORDER = [
        ["Pattern Insight",            card.aboutThisPattern],
        ["Why It Started",             card.rootPattern],
        ["Core Belief",                card.coreBelief],
        ["Hidden Rule",                card.hiddenRule],
        ["The Cost of Keeping It",     card.tradeOff],
        ["The Surfacing Tension",      card.whatMightBeEmerging],
        ["Inner Impact",               card.innerImpact],
        ["What Makes It Stronger",     card.environmentalAmplifiers],
        ["Break the Loop",             card.alignmentDirective],
        ["Living in Flow",             card.thrivingState],
      ];
      const sections = ORDER.map(([t, v]) => srSection(t, v)).join("");

      const cardHTML = `
        <div class="sliproot-card">
          ${sharedHeader(THEME)}
          <div class="sr-body">
            ${sections}
          </div>
        </div>
        <div id="sr-footer">
          <hr class="sr-divider">
          <p class="sr-disclaimer" align="center">Sliproot offers reflective analysis, not therapy, medical, or legal advice. Use your judgment and seek professional support when needed.</p>
          <p class="sr-more" align="center">More tools at <a href="https://alchAlign.com" target="_blank" rel="noopener">alchAlign.com</a>.</p>
        </div>
      `.trim();

      return emailShell({
        title: THEME.header,
        preheader: "Your insight is ready.",
        innerHTML: cardHTML,
        viewUrl: THEME.viewUrl
      });
    }

    // =============== INPUTS ===============
    const evt  = steps.trigger?.event || {};
    const body = evt.body || {};
    const gen  = steps.generate_sliproot_v2?.$return_value || steps.generate_sliproot_v2 || {};

    // email (direct or from magic token)
    let email = String(body.email ?? gen?.email ?? "").trim();
    if (!email) {
      const auth = evt.headers?.authorization || "";
      const token = (auth.match(/^Bearer\s+(.+)$/i) || [])[1] || null;
      const CLAIM_SECRET = process.env.CLAIM_SECRET;
      if (token && token.startsWith("v1.") && CLAIM_SECRET) {
        const crypto = await import("crypto");
        const [v, dataB64, sig] = token.split(".");
        const expected = crypto.createHmac("sha256", CLAIM_SECRET).update(dataB64).digest("base64")
          .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        if (sig === expected) {
          try {
            const json = JSON.parse(Buffer.from(
              dataB64.replace(/-/g, "+").replace(/_/g, "/"), "base64"
            ).toString());
            if (json?.sub) email = String(json.sub);
          } catch {}
        }
      }
    }

    const rawCard = body.card ?? gen ?? {};
    const card    = extractCard(rawCard);

    // normalize legacy keys
    card.aboutThisPattern        ||= card.patternInsight;
    card.rootPattern             ||= card.whyItStarted;
    card.coreBelief              ||= card.coreBelief;
    card.hiddenRule              ||= card.hiddenRule;
    card.tradeOff                ||= card.theCost;
    card.whatMightBeEmerging     ||= card.emergingTension;
    card.innerImpact             ||= card.systemInfluence;
    card.environmentalAmplifiers ||= card.amplifiers;
    card.alignmentDirective      ||= card.alignmentOpportunities;
    card.thrivingState           ||= card.integrate;

    if (!email || !Object.keys(card).length) {
      return { skipped: true, reason: "no email or card" };
    }

    // =============== BUILD HTML + TEXT ===============
    const rawHtml = buildSliprootEmailHTML({ card });
    const html = juice(rawHtml); // inline CSS

    const ORDER_KEYS = [
      "aboutThisPattern", "rootPattern", "coreBelief", "hiddenRule", "tradeOff",
      "whatMightBeEmerging", "innerImpact", "environmentalAmplifiers",
      "alignmentDirective", "thrivingState"
    ];
    const LABELS = {
      aboutThisPattern: "Pattern Insight",
      rootPattern: "Why It Started",
      coreBelief: "Core Belief",
      hiddenRule: "Hidden Rule",
      tradeOff: "The Cost of Keeping It",
      whatMightBeEmerging: "The Surfacing Tension",
      innerImpact: "Inner Impact",
      environmentalAmplifiers: "What Makes It Stronger",
      alignmentDirective: "Break the Loop",
      thrivingState: "Living in Flow"
    };
    const text = [
      THEME.header,
      ...ORDER_KEYS.map(k => {
        const v = String(card[k] || "").trim();
        return v ? `\n${(LABELS[k] || k)}\n${v}` : "";
      }),
      "\n—",
      "Sliproot offers reflective analysis, not therapy, medical, or legal advice. Use your judgment and seek professional support when needed.",
      "More: alchAlign.com"
    ].filter(Boolean).join("\n");

    // =============== SEND ===============
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const RESEND_FROM    = process.env.RESEND_FROM;
    if (!RESEND_API_KEY || !RESEND_FROM) throw new Error("Missing RESEND_API_KEY or RESEND_FROM");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: email,
        subject: THEME.header,
        html,
        text
      })
    });

    const respText = await res.text();
    let id = null;
    try { id = JSON.parse(respText)?.id || null; } catch {}
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${respText}`);

    $.export("resend_id", id);
    return { emailed: true, to: email, id };
  }
});
