import { Resend } from "resend";
import juice from "juice";

export default defineComponent({
  name: "Send Alignment Guide Email",
  description: "Sends the formatted alignment guide via email, with error handling for failed guide generation",
  type: "action",
  props: {
    email: {
      type: "string",
      label: "Email Address",
      description: "Email address to send the alignment guide to"
    },
    format_result: {
      type: "object",
      label: "Format Result",
      description: "Either steps.format_result.$return_value OR steps.custom_prompt.$response.body (string)"
    }
  },
  async run({ $ }) {
    const email = (this.email || "").trim();
    if (!email || !email.includes("@")) return { sent: false, reason: "no_email" };

    // --- helpers ---
    const nonEmpty = (s) => typeof s === "string" && s.trim().length > 0;
    function stringifyError(e) {
      if (!e) return "Unknown error";
      if (typeof e === "string") return e;
      if (e?.message && typeof e.message === "string") return e.message;
      try { return JSON.stringify(e); } catch { return String(e); }
    }

    // --- Unwrap the upstream result robustly ---
    // Supports:
    //  1) steps.format_result.$return_value (object)
    //  2) steps.custom_prompt.$response.body (JSON string)
    //  3) steps.custom_prompt.$return_value with { body: "<json string>" }
    const src = this.format_result;
    let raw = {};

    try {
      if (typeof src === "string") {
        // case: bound directly to $response.body (JSON string)
        raw = JSON.parse(src);
      } else if (src && typeof src === "object" && typeof src.body === "string") {
        // case: HTTP-like object with string body
        raw = JSON.parse(src.body);
      } else {
        // case: already the normalized object (format_result.$return_value)
        raw = src?.$return_value ?? src ?? {};
      }
    } catch (e) {
      $.export("parse_error", String(e?.message || e));
      raw = src?.$return_value ?? src ?? {};
    }

    const hasError = raw?.success === false;

    // Primary HTML path (covers both shapes)
    const guideHtml =
      raw?.body?.guide?.html ||
      raw?.guide?.html ||
      raw?.html ||
      (typeof raw === "string" ? raw : "") ||
      "";

    const resend = new Resend(process.env.RESEND_API_KEY);

    // === Error branch: upstream failed or no usable HTML → DO NOT email user ===
    if (hasError || !nonEmpty(guideHtml)) {
      const errorReason = stringifyError(
        raw?.error ?? raw?.message ?? (hasError ? "Upstream success=false" : "No HTML guide produced")
      );

      $.export("$summary", `Alignment guide email skipped due to generation failure: ${errorReason}`);
      $.export("diag_success", raw?.success);
      $.export("diag_keys", Object.keys(raw || {}));
      $.export("diag_has_html", !!(raw?.body?.guide?.html || raw?.guide?.html || raw?.html));
      $.export("diag_len", (raw?.body?.guide?.html || raw?.guide?.html || raw?.html || "").length);
      $.export("reason", String(errorReason));

      // Just return metadata; no customer-facing email.
      return {
        sent: false,
        type: "skipped_due_to_generation_error",
        to: email,
        reason: String(errorReason)
      };
    }

    // === Success path ===
    // sanitize
    const safeGuideHtml = String(guideHtml).replace(/<script[\s\S]*?<\/script>/gi, "");

    // Medallion
    function medallion(char = "✦", {
      innerD = 72, outerD = 120, fontSize = 34,
      innerBg = "linear-gradient(135deg,#F7F8FC,#EEF0FA)",
      outerBg = "linear-gradient(135deg,#ECECF7,#F6F6FB)",
      color   = "#3F3C97",
      marginBottom = 12
    } = {}) {
      return `
      <table role="presentation" align="center" width="${outerD}" style="margin:0 auto ${marginBottom}px;border-collapse:collapse;">
        <tr>
          <td width="${outerD}" height="${outerD}" style="width:${outerD}px;height:${outerD}px;border-radius:50%;background:${outerBg};text-align:center;">
            <table role="presentation" align="center" width="${innerD}" style="margin:0 auto;border-collapse:collapse;">
              <tr>
                <td width="${innerD}" height="${innerD}"
                    style="width:${innerD}px;height:${innerD}px;border-radius:50%;
                           background:${innerBg};text-align:center;
                           mso-line-height-rule:exactly;line-height:${innerD}px;
                           font-size:${fontSize}px;font-weight:700;color:${color};">
                  ${char}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`.trim();
    }

    const CSS = `
.head{max-width:760px;margin:0 auto;background:#fff;border-radius:16px 16px 0 0;padding:22px 20px 8px;text-align:center;}
.head .title{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:32px;font-weight:700;color:#1F2230;margin:6px 0 6px;text-align:center;}
.rule-strong{border:0;border-top:2px solid #B5B1E3;width:64px;margin:14px auto 0;}
.alignment-scan{max-width:740px;margin:0 auto;background:#ffffff;padding:24px 20px;font-family:Georgia,'Times New Roman',serif;color:#2B2B2B;line-height:1.75;}
.alignment-scan .as-section{margin:28px 0 0;padding:14px 0 0;border-left:0;border-top:1px solid #E6E6F2;}
.alignment-scan .as-section-plan{display:inline-block !important;font-family:Inter, Arial, Helvetica, sans-serif !important;font-weight:700 !important;font-size:13px !important;line-height:1 !important;color:#3F3C97 !important;background:#E6E6F2 !important;border:1px solid #B5B1E3 !important;border-radius:9999px !important;padding:7px 12px !important;margin:4px 0 12px !important;letter-spacing:.2px !important;}
.alignment-scan h2{font-family:"Helvetica Neue",Arial,sans-serif;font-size:20px;font-weight:800;color:#3F3C97;margin:0 0 12px;}
.alignment-scan h3{font-family:Georgia,'Times New Roman',serif;font-size:15.5px;font-style:italic;font-weight:600;margin:18px 0 6px;color:#3B405A;}
.alignment-scan p{font-size:15.5px;margin:0 0 14px;}
.alignment-scan .tool-links{margin:28px 0 0;padding:16px 0 0;border-top:2px solid #E6E6F2;font-family:"Helvetica Neue",Arial,sans-serif;}
.alignment-scan .tool-links h3{font-size:15px;font-weight:700;margin:0 0 6px;color:#3F3C97;}
.alignment-scan .tool-links a{color:#3F3C97;text-decoration:none;border-bottom:1px solid #D7D3F0;}
.alignment-scan .tool-links a:hover{text-decoration:underline;}
.alignment-scan .disclaimer{
  margin:20px 0 0 !important;
  padding:12px 0 0 !important;
  border-top:2px solid #E6E6F2 !important;
  color:#555 !important;
  font-size:12.5px !important;
  line-height:1.6 !important;
  font-family: Arial, Helvetica, sans-serif !important;
}
.footer{max-width:740px;margin:18px auto 0;text-align:center;font:12px/1.6 Arial,sans-serif;color:#888;}
.footer a{color:#888;text-decoration:none;}
.footer a:hover{text-decoration:underline;}
@media only screen and (max-width:480px){
  .alignment-scan{padding:18px;}
  .head .title{font-size:28px;}
  .alignment-scan h2{font-size:18px;}
  .alignment-scan h3{font-size:14px;}
  .alignment-scan p{font-size:14.5px;}
}
`.trim();

    const preheader = "Your Alignment Guide from alchAlign.";
    const viewUrl   = "https://alchalign.com/alignment-guide";

    const htmlDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  <title>Your Alignment Guide</title>
  <style>${CSS}</style>
</head>
<body style="margin:0;padding:0;background:#F6F7F8;">
  <div style="display:none!important;opacity:0;color:transparent;height:0;max-height:0;overflow:hidden;mso-hide:all;">
    ${preheader}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr><td align="center" style="padding:0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="760" style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
        <!-- chrome -->
        <tr>
          <td style="padding:12px 18px; font:13px/18px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#6b7280;">
            <span style="float:right;"><a href="${viewUrl}" style="color:#6b7280;">View online</a></span>
            alchAlign • Alignment Scan
          </td>
        </tr>

        <!-- header -->
        <tr>
          <td class="head" style="max-width:760px;margin:0 auto;background:#fff;border-radius:16px 16px 0 0;padding:22px 20px 8px;text-align:center;">
            ${medallion()}
            <span class="title" style="display:block;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:700;color:#1F2230;margin:6px 0 6px;text-align:center;">
              Your Alignment Guide
            </span>
            <hr class="rule-strong" style="border:0;border-top:2px solid #B5B1E3;width:64px;margin:14px auto 0;">
          </td>
        </tr>

        <!-- body -->
        <tr>
          <td style="padding:0;">
            <div class="alignment-scan" style="max-width:740px;margin:0 auto;background:#ffffff;padding:10px 20px;font-family:Georgia,'Times New Roman',serif;color:#2B2B2B;line-height:1.75;">
              ${safeGuideHtml}
            </div>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td class="footer" style="max-width:740px;margin:18px auto 0;text-align:center;font:12px/1.6 Arial,sans-serif;color:#888;">
            Sent from <strong>alchAlign</strong> · <a href="https://alchalign.com" style="color:#888;text-decoration:none;">alchalign.com</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

    // Inline CSS (don't fail the send if inlining throws)
    let html;
    try {
      html = juice(htmlDoc, {
        preserveMediaQueries: true,
        applyWidthAttributes: true,
        applyHeightAttributes: true
      });
    } catch (e) {
      html = htmlDoc;
      $.export("$summary", `Juice inlining failed, sent without inlining: ${e?.message || e}`);
    }

    const text = [
      "Your Alignment Guide",
      String(guideHtml)
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
      "\n—",
      "alchAlign.com"
    ].join("\n\n");

    const { data, error } = await resend.emails.send({
      from: "alchAlign <support@alchalign.com>",
      to: email,
      subject: "Your Alignment Guide",
      html,
      text
    });

    if (error) throw new Error(`email_send_failed: ${error?.message || String(error)}`);

    $.export("$summary", `Successfully sent alignment guide email (HTML length: ${String(guideHtml).length})`);
    $.export("diag_source_type", typeof this.format_result);
    $.export("diag_has_body_string", typeof src?.body === "string");
    $.export("diag_keys", Object.keys(raw || {}));
    $.export("diag_has_html", !!(raw?.body?.guide?.html || raw?.guide?.html || raw?.html));
    $.export("diag_len", (raw?.body?.guide?.html || raw?.guide?.html || raw?.html || "").length);
    $.export("diag_preview", String(guideHtml || "").slice(0, 140));

    return { sent: true, type: "alignment_guide", to: email, id: data?.id || null };
  }
});
