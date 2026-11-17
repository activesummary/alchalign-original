export default defineComponent({
  name: "Extract HTML Content",
  description: "Extract HTML content from upstream step response, handling HTTP response objects and error conditions",
  type: "action",
  props: {
    sourceData: {
      type: "any",
      label: "Source Data",
      description: "The response data from the upstream step (e.g., custom_prompt step output)"
    }
  },
  async run({ $ }) {
    const src = this.sourceData;
    let html = null;
    let raw = null;
    let errorInfo = null;
    let httpStatus = null;
    let responseHeaders = null;

    const debugInfo = {
      sourceType: typeof src,
      hasData: !!src?.data,
      dataType: typeof src?.data,
      hasResponse: !!src?.$response,
      responseType: typeof src?.$response,
      topLevelKeys: src && typeof src === 'object' ? Object.keys(src) : [],
      httpStatus: null,
      contentLength: null
    };

    const looksLikeHtml = (s) => typeof s === "string" && /<[^>]+>/.test(s);
    const sanitize = (s) => String(s || "").replace(/<script[\s\S]*?<\/script>/gi, "").trim();

    // 1) HTTP meta
    if (src && typeof src === 'object' && src.$response) {
      httpStatus = src.$response.status || src.status || null;
      responseHeaders = src.$response.headers || src.headers || null;
      debugInfo.httpStatus = httpStatus;
      if (responseHeaders && responseHeaders['content-length']) {
        debugInfo.contentLength = responseHeaders['content-length'];
      }
      if (httpStatus === 204) {
        errorInfo = { type: "no_content", message: "Upstream step returned HTTP 204 (No Content)", status: httpStatus };
      } else if (httpStatus >= 400) {
        errorInfo = { type: "http_error", message: `Upstream step returned HTTP ${httpStatus}`, status: httpStatus };
      }
    }

    // 2) src.data (string) → parse or treat as HTML/text
    if (!html && src && typeof src === 'object' && typeof src.data === 'string') {
      try {
        const parsed = JSON.parse(src.data);
        html =
          parsed?.body?.guide?.html ||   // << FIXED: support body.guide.html
          parsed?.guide?.html ||
          parsed?.body?.html ||
          parsed?.html ||
          parsed?.content || null;
        raw =
          parsed?.body?.guide?.raw ||
          parsed?.guide?.raw ||
          parsed?.body?.raw ||
          parsed?.raw || null;
        if (!html && (parsed?.error || parsed?.message)) {
          errorInfo = { type: "api_error", message: parsed.error || parsed.message, fullResponse: parsed };
        }
      } catch {
        if (looksLikeHtml(src.data) || src.data.includes('<!DOCTYPE')) {
          html = src.data;
        } else {
          raw = src.data;
        }
      }
    }

    // 3) src.data (object)
    if (!html && src && typeof src === 'object' && src.data && typeof src.data === 'object') {
      const d = src.data;
      html =
        d?.body?.guide?.html ||
        d?.guide?.html ||
        d?.body?.html ||
        d?.html ||
        d?.content || null;
      raw =
        d?.body?.guide?.raw ||
        d?.guide?.raw ||
        d?.body?.raw ||
        d?.raw || null;
      if (!html && (d?.error || d?.message)) {
        errorInfo = { type: "api_error", message: d.error || d.message, fullResponse: d };
      }
    }

    // 4) src.$response.body (string)
    if (!html && src && typeof src === 'object' && typeof src.$response?.body === 'string') {
      try {
        const parsed = JSON.parse(src.$response.body);
        html =
          parsed?.body?.guide?.html ||
          parsed?.guide?.html ||
          parsed?.body?.html ||
          parsed?.html ||
          parsed?.content || null;
        raw =
          parsed?.body?.guide?.raw ||
          parsed?.guide?.raw ||
          parsed?.body?.raw ||
          parsed?.raw || null;
        if (!html && (parsed?.error || parsed?.message)) {
          errorInfo = { type: "response_error", message: parsed.error || parsed.message, fullResponse: parsed };
        }
      } catch {
        if (looksLikeHtml(src.$response.body) || src.$response.body.includes('<!DOCTYPE')) {
          html = src.$response.body;
        } else {
          raw = src.$response.body;
        }
      }
    }

    // 5) src.$response.body (object)
    if (!html && src && typeof src === 'object' && src.$response && typeof src.$response.body === 'object') {
      const b = src.$response.body;
      html =
        b?.body?.guide?.html ||  // (rare double body nesting, harmless)
        b?.guide?.html ||
        b?.body?.html ||
        b?.html ||
        b?.content || null;
      raw =
        b?.body?.guide?.raw ||
        b?.guide?.raw ||
        b?.body?.raw ||
        b?.raw || null;
      if (!html && (b?.error || b?.message)) {
        errorInfo = { type: "response_error", message: b.error || b.message, fullResponse: b };
      }
    }

    // 6) src.$response (string)
    if (!html && src && typeof src.$response === 'string') {
      try {
        const parsed = JSON.parse(src.$response);
        html =
          parsed?.body?.guide?.html ||
          parsed?.guide?.html ||
          parsed?.body?.html ||
          parsed?.html ||
          parsed?.content || null;
        raw =
          parsed?.body?.guide?.raw ||
          parsed?.guide?.raw ||
          parsed?.body?.raw ||
          parsed?.raw || null;
      } catch {
        if (looksLikeHtml(src.$response) || src.$response.includes('<!DOCTYPE')) {
          html = src.$response;
        }
      }
    }

    // 7) src is string
    if (!html && typeof src === 'string') {
      try {
        const parsed = JSON.parse(src);
        html =
          parsed?.body?.guide?.html ||
          parsed?.guide?.html ||
          parsed?.body?.html ||
          parsed?.html ||
          parsed?.content || null;
        raw =
          parsed?.body?.guide?.raw ||
          parsed?.guide?.raw ||
          parsed?.body?.raw ||
          parsed?.raw || null;
      } catch {
        if (looksLikeHtml(src) || src.includes('<!DOCTYPE')) {
          html = src;
        }
      }
    }

    // 8) Fallback to direct props on src
    if (!html && src && typeof src === 'object') {
      html =
        src?.body?.guide?.html ||
        src?.guide?.html ||
        src?.body?.html ||
        src?.html ||
        src?.content || null;
      raw =
        src?.body?.guide?.raw ||
        src?.guide?.raw ||
        src?.body?.raw ||
        src?.raw || null;
      if (!html && (src?.error || src?.message)) {
        errorInfo = { type: "direct_error", message: src.error || src.message, fullResponse: src };
      }
      if (!html) {
        for (const [k, v] of Object.entries(src)) {
          if (typeof v === 'string' && (looksLikeHtml(v) || v.includes('<!DOCTYPE'))) {
            html = v; break;
          }
        }
      }
    }

    // Debug logs
    console.log("=== Extract HTML Content Debug Info ===");
    console.log("Debug Info:", JSON.stringify(debugInfo, null, 2));
    console.log("HTTP Status:", httpStatus);
    console.log("Has HTML:", !!html);
    console.log("Has Raw Content:", !!raw);
    console.log("Error Info:", errorInfo);
    try { console.log("Source sample:", JSON.stringify(src).slice(0, 500) + "..."); } catch {}

    // Outcomes
    if (!html && errorInfo) {
      $.export("$summary", `Upstream step failed: ${errorInfo.message} (Status: ${httpStatus || 'unknown'})`);
      return {
        success: false,
        error: errorInfo,
        debugInfo,
        httpStatus,
        body: { guide: { html: null, raw: raw || null, error: errorInfo.message } }
      };
    }

    if (!html || typeof html !== "string" || !html.trim()) {
      $.export("$summary", "No HTML content found in upstream response");
      return {
        success: false,
        error: { type: "no_html_content", message: "No HTML content found in the expected response fields" },
        debugInfo,
        httpStatus,
        availableData: raw || "No alternative content available",
        body: { guide: { html: null, raw: raw || null, error: "No HTML content found" } }
      };
    }

    // Success
    html = sanitize(html);
    $.export("$summary", `Successfully extracted HTML content (${html.length} chars) from upstream response`);

    return {
      success: true,
      debugInfo,
      httpStatus,
      body: { guide: { html: html.trim(), raw: raw || null } }
    };
  },
});
