import axios from "axios";

export default defineComponent({
  async run({ steps, $ }) {
    // === Inputs ===
    const gen = steps.custom_request?.$return_value || {};
    const title = (steps.trigger?.event?.body?.title || gen.title || "Your AlignDaily Plan").trim();

    const email =
      (typeof gen.email === "string" && gen.email) ||
      steps.trigger?.event?.body?.email ||
      gen.meta?.email ||
      null;

    const VIEW_URL =
  steps.trigger?.event?.body?.viewUrl ||
  "https://alchalign.com/your-plan";


    // ---------- AlignDaily DOM-free inline normalizer (no external packages) ----------
    function normalizeAlignDaily(planHtmlRaw = "") {
      if (!planHtmlRaw) return "";

      // Strip any embedded <style> from the generator
      let html = planHtmlRaw.replace(/<style[\s\S]*?<\/style>/gi, "");

      const ensureSemicolon = (s) => (s && !/;\s*$/.test(s) ? s + ";" : s);

      function addInlineToTags(h, tag, css) {
        // 1) tags with existing style
        h = h.replace(
          new RegExp(`<${tag}\\b([^>]*?\\bstyle=")([^"]*)"([^>]*)>`, "gi"),
          (_m, pre, s, post) => `<${tag}${pre}${ensureSemicolon(s)} ${css}"${post}>`
        );
        // 2) tags w/o style
        h = h.replace(
          new RegExp(`<${tag}\\b((?:(?!style=)[^>])*)>`, "gi"),
          (_m, attrs) => `<${tag}${attrs} style="${css}">`
        );
        return h;
      }

      function addInlineToClass(h, className, css) {
        return h.replace(
          new RegExp(`<([a-z0-9]+)([^>]*?\\bclass="[^"]*\\b${className}\\b[^"]*"[^>]*)>`, "gi"),
          (_m, tag, attrs) => {
            if (/style="/i.test(attrs)) {
              return `<${tag}${attrs.replace(/style="([^"]*)"/i, (_m2, s) => `style="${ensureSemicolon(s)} ${css}"`)}>`;
            }
            return `<${tag}${attrs} style="${css}">`;
          }
        );
      }

      function wrapGroceryCategories(h) {
        if (/grocery-grid/.test(h) || !/grocery-category/.test(h)) return h;
        return h.replace(
          /((?:\s*<div class="grocery-category[\s\S]*?<\/div>)+)/gi,
          '<div class="grocery-grid">$1</div>'
        );
      }

      function styleInsideWorkoutBlocks(h) {
        return h.replace(
          /(<div[^>]*class="[^"]*workout-block[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/gi,
          (_m, open, inner, close) => {
            let chunk = inner;
            // list: no markers, no left padding
            chunk = addInlineToTags(
              chunk,
              "ol",
              "margin:0 !important; padding-left:0 !important; list-style:none !important;"
            );
            // each item = soft card + spacing; implicit divider on subsequent items
            let i = 0;
            chunk = chunk.replace(/<li\b([^>]*)>/gi, (_mm, attrs) => {
              const extra =
                i++ > 0
                  ? " border-top:1px solid #DDE5F2 !important; padding-top:14px !important;"
                  : "";
              const base =
                "background:#F9F9FB !important; border-radius:8px !important; padding:12px 14px !important; margin-bottom:12px !important;";
              if (/style="/i.test(attrs)) {
                return `<li${attrs.replace(/style="([^"]*)"/i, (_m3, s) => `style="${ensureSemicolon(s)} ${base}${extra}"`)}>`;
              }
              return `<li${attrs} style="${base}${extra}">`;
            });
            return `${open}${chunk}${close}`;
          }
        );
      }

      // ----- Base typography (unify size/line-height + neutral color) -----
      const BASE_TEXT =
        "font-size:17px !important; line-height:1.7 !important; color:#1F2933 !important; font-family:Inter, Arial, Helvetica, sans-serif !important;";

      ["p", "li"].forEach((t) => {
        html = addInlineToTags(
          html,
          t,
          BASE_TEXT + (t === "p" ? " margin:0 0 10px !important;" : " margin:8px 0 !important;")
        );
      });
      html = addInlineToTags(html, "div", "color:#1F2933 !important;");
      html = addInlineToTags(html, "span", "color:#1F2933 !important;");
      html = addInlineToTags(html, "strong", "color:#1F2933 !important;");
      html = addInlineToTags(html, "em", "color:#1F2933 !important;");
      html = addInlineToTags(
        html,
        "a",
        "color:inherit !important; text-decoration:none !important; border-bottom:1px solid #C9D6EA !important;"
      );

      // Lists: bullets OFF by default
      html = addInlineToTags(
        html,
        "ul",
        "list-style:none !important; padding-left:0 !important; margin:8px 0 !important;"
      );
      html = addInlineToTags(
        html,
        "ol",
        "list-style:none !important; padding-left:0 !important; margin:8px 0 !important;"
      );

      // Headings
      html = addInlineToTags(
        html,
        "h2",
        "font-weight:800 !important; font-size:24px !important; line-height:1.25 !important; color:#223B72 !important; margin:0 0 8px !important;"
      );
      html = addInlineToTags(
        html,
        "h3",
        "font-weight:800 !important; font-size:22px !important; line-height:1.25 !important; color:#223B72 !important; margin:0 0 8px !important;"
      );
      html = addInlineToTags(
        html,
        "h4",
        "font-weight:700 !important; font-size:19px !important; line-height:1.3  !important; color:#1E2C45 !important; margin:10px 0 8px !important;"
      );
      html = addInlineToTags(
        html,
        "h5",
        "font-weight:800 !important; font-size:18px !important; line-height:1.35 !important; color:#223B72 !important; margin:0 0 8px !important;"
      );

      // Day card
      html = addInlineToClass(
        html,
        "day-block",
        "background:#FFFFFF !important; border:1px solid #E6EAF2 !important; border-radius:14px !important; padding:20px !important; margin:20px 0 !important;"
      );

      // Workouts
      html = addInlineToClass(
        html,
        "workout-block",
        "background:#F4F7FB !important; border:1px solid #E1E8F3 !important; border-left:4px solid #2A4D8F !important; border-radius:12px !important; padding:16px 18px !important; margin:14px 0 18px !important;"
      );
      html = styleInsideWorkoutBlocks(html);

      // Meals
      html = html.replace(/class="([^"]*)meal-title([^"]*)"/gi, 'class="$1meal-heading$2"');
      html = addInlineToClass(
        html,
        "meal-heading",
        "display:block !important; font-weight:800 !important; font-size:19px !important; line-height:1.3 !important; color:#223B72 !important; margin:15px 0 10px !important;"
      );
      html = addInlineToClass(
        html,
        "meal-block",
        "background:#FFFFFF !important; border:1px solid #E9EDF4 !important; border-radius:12px !important; padding:14px 16px !important; margin:12px 0 14px !important;"
      );

      // Flowproofing
      html = addInlineToClass(
        html,
        "notes-block",
        "margin-top:20px !important; padding-top:20px !important; border-top:1px solid #DDD !important;"
      );
      html = addInlineToClass(
        html,
        "note-tip",
        "background:#EAEEF2 !important; padding:14px 16px !important; border-left:4px solid #D8A948 !important; margin:12px 0 !important; border-radius:10px !important; font-size:17px !important; color:#24323A !important;"
      );
         // Disclaimer
      html = addInlineToClass(
        html,
        "disclaimer",
        "font-size: 0.7rem !important; margin-top:20px !important; padding-top:20px !important; border-top:1px solid #DDD !important;"
      );

      // Keystone
      html = addInlineToClass(
        html,
        "keystone",
        "border-left:2px dotted #2A4D8F !important; background:transparent !important; padding:8px !important; margin:0 !important; border-radius:4px !important; font-size:17px !important; color:#1F2933 !important;"
      );
      html = html.replace(
        /(<[^>]*class="[^"]*keystone[^"]*"[^>]*>)([\s\S]*?)(<\/[^>]+>)/gi,
        (m, open, inner, close) =>
          `${open}${inner.replace(
            /<h5\b([^>]*)>/gi,
            (_m2, attrs) =>
              `<h5${
                /style="/i.test(attrs)
                  ? attrs.replace(
                      /style="([^"]*)"/i,
                      (_m3, s) =>
                        `style="${ensureSemicolon(
                          s
                        )} font-weight:800 !important; font-size:20px !important; line-height:1.35 !important; color:#223B72 !important; margin:0 0 8px !important;"`
                    )
                  : `${attrs} style="font-weight:800 !important; font-size:20px !important; line-height:1.35 !important; color:#223B72 !important; margin:0 0 8px !important;"`
              }>`
          )}${close}`
      );

      // Grocery
      html = wrapGroceryCategories(html);
      html = addInlineToClass(
        html,
        "grocery-grid",
        "background:#F9FAFA !important; border-radius:14px !important; padding:16px !important;"
      );
      html = addInlineToClass(
        html,
        "grocery-category",
        "display:block !important; width:100% !important; max-width:100% !important; margin:0 0 12px 0 !important; background:#FFFFFF !important; border:1px solid #EAEFF5 !important; border-radius:12px !important; padding:12px 14px !important; font-size:17px !important; color:#2D3740 !important;"
      );
      html = html.replace(
        /<div class="grocery-category">([\s\S]*?)<\/div>/gi,
        (m, inner) =>
          `<div class="grocery-category">${inner
            .replace(
              /<p([^>]*)>/gi,
              (_m2, attrs) =>
                `<p${
                  /style="/i.test(attrs)
                    ? attrs.replace(
                        /style="([^"]*)"/i,
                        (_m3, s) =>
                          `style="${ensureSemicolon(
                            s
                          )} margin:0 0 6px !important; font-weight:800 !important; color:#223B72 !important;"`
                      )
                    : `${attrs} style="margin:0 0 6px !important; font-weight:800 !important; color:#223B72 !important;"`
                }>`
            )
            .replace(
              /<(ul|ol)([^>]*)>/gi,
              (_m2, tag, attrs) =>
                `<${tag}${
                  /style="/i.test(attrs)
                    ? attrs.replace(
                        /style="([^"]*)"/i,
                        (_m3, s) =>
                          `style="${ensureSemicolon(
                            s
                          )} list-style:none !important; padding-left:0 !important; margin-left:0 !important;"`
                      )
                    : `${attrs} style="list-style:none !important; padding-left:0 !important; margin-left:0 !important;"`
                }>`
            )}</div>`
      );

      // Final wrapper to guarantee base type
      return `<div class="markdown-plan" style="font-size:17px; line-height:1.7; color:#1F2933; font-family:Inter, Arial, Helvetica, sans-serif;">${html}</div>`;
    }

    // Centered blue hero (same used in both steps)
 function buildAlignDailyHero() {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:780px;margin:0 auto;">
    <tr>
      <td class="hero-pad" style="background:#EFF4FA; border:1px solid #DCE6F2; border-radius:16px; padding:28px 20px 22px; text-align:center;">
        <div style="font:800 28px/1.2 Inter, Arial, Helvetica, sans-serif; color:#22477A; margin:0 0 8px;">Your Custom Fitness + Meal Plan</div>
        <div style="font:500 15.5px/1.6 Inter, Arial, Helvetica, sans-serif; color:#55657A; margin:0 0 14px;">Personalized structure for sustainable wellness</div>
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            <td style="height:6px; width:44px; background:#D8A948; border-radius:3px 0 0 3px; font-size:0; line-height:0;">&nbsp;</td>
            <td style="height:6px; width:44px; background:#2A4D8F; border-radius:0 3px 3px 0; font-size:0; line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}


    // === Resolve plan HTML ===
    let planHtml = null;
    if (typeof gen.plan === "string" && gen.plan.trim()) {
      planHtml = gen.plan.trim();
    } else {
      const content = steps.custom_request?.$return_value?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) {
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed.plan === "string" && parsed.plan.trim()) {
            planHtml = parsed.plan.trim();
          } else {
            planHtml = content.trim();
          }
        } catch {
          planHtml = content.trim();
        }
      }
    }
    if (!email || !planHtml) {
      return { sent: false, reason: !email ? "missing_email" : "missing_html" };
    }

    // Extract <body> inner if a full HTML doc was returned; wrap plaintext
    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(planHtml);
    if (bodyMatch) planHtml = bodyMatch[1].trim();
    if (!/[<][a-z!/]/i.test(planHtml)) {
      planHtml = `<pre style="font-family: Inter, Arial, Helvetica, sans-serif; white-space: pre-wrap; margin:0">${planHtml}</pre>`;
    }

    // Normalize + inline styling
    const normalizedPlan = normalizeAlignDaily(planHtml);

    // === Email HTML (define ONCE) ===
const preheader = "Your AlignDaily plan is inside—workouts, meals, grocery list.";
const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  <title>${title}</title>
  <style>
    /* mobile gutters */
    @media only screen and (max-width:480px){
      .outer-pad { padding-left:8px !important; padding-right:8px !important; }
      .card-pad  { padding:14px !important; }
      .hero-pad  { padding:22px 16px 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F6F7F8;">
  <!-- preheader -->
  <div style="display:none!important;opacity:0;color:transparent;height:0;max-height:0;overflow:hidden;mso-hide:all;">
    ${preheader}
  </div>

  <center style="width:100%;background:#F6F7F8;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr><td align="center" class="outer-pad" style="padding:24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="780"
               style="width:100%;max-width:780px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
          <!-- utility header row -->
          <tr>
            <td style="padding:12px 18px;font:13px/18px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#6b7280;">
              alchAlign • AlignDaily
              <span style="float:right;">
                <a href="${VIEW_URL}" target="_blank" rel="noopener"
                   style="color:#6b7280;text-decoration:none;border-bottom:1px solid #D5D8DE;">
                  View online
                </a>
              </span>
            </td>
          </tr>

          <!-- hero -->
          <tr><td style="padding:0 18px 12px;">${buildAlignDailyHero()}</td></tr>

          <!-- plan card -->
          <tr>
            <td class="card-pad" style="background:#FFFFFF;padding:18px;">
              ${normalizedPlan}
            </td>
          </tr>

          <!-- footer line -->
          <tr>
            <td style="padding:12px 18px 18px;font:12px/18px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#6b7280;">
              alchAlign — You’re receiving this because you requested a copy of your plan.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </center>
</body>
</html>`.trim();


    // === Text fallback (from normalized plan) ===
    const text = `${title}\n\n` + normalizedPlan
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h\\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // === Send ===
    if (!process.env.RESEND_API_KEY) {
      return { sent: false, reason: "missing_resend_key" };
    }

    try {
      const response = await axios.post(
        "https://api.resend.com/emails",
        {
          from: "alchAlign <support@alchalign.com>",
          to: email,
          subject: title,
          html: emailHtml,
          text
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      const id = response.data?.id || null;
      $.export("resend_id", id);
      return { sent: true, id, to: email };
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : String(err.message || err);
      return { sent: false, error: detail };
    }
  },
});
