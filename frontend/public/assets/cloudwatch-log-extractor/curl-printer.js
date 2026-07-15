/**
 * CurlPrinter — JavaScript port of the Java CurlPrinter utility.
 *
 * Parses an MVAX_AUDIT JSON log line and produces a cURL command string.
 */
const CurlPrinter = (() => {

  /**
   * Main entry point.  Accepts a raw log line (may include timestamp / logger prefix)
   * and returns a formatted cURL command string.
   *
   * @param {string} rawLogLine
   * @returns {string}
   */
  function fromAuditLog(rawLogLine) {
    const json = extractJson(rawLogLine);
    const root = JSON.parse(json);

    const url          = root.requestURL   || '';
    const body         = root.requestBody  || '';
    const headerString = root.requestHeader || '';

    const headers = parseHeaders(headerString);

    return buildCurl(url, headers, body);
  }

  // ── private helpers ────────────────────────────────────────────────

  /**
   * Extracts the JSON portion from a log line.
   * The JSON object starts at the first '{' and ends at the last '}'.
   */
  function extractJson(logLine) {
    const start = logLine.indexOf('{');
    const end   = logLine.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('No JSON object found in the log line');
    }
    return logLine.substring(start, end + 1);
  }

  /**
   * Parses the requestHeader string "{key=value, key=value, …}" into a Map.
   * Header values may themselves contain '=' so only the first '=' is the split point.
   */
  function parseHeaders(headerString) {
    const headers = new Map();
    if (!headerString || !headerString.trim()) return headers;

    let cleaned = headerString.trim();
    if (cleaned.startsWith('{')) cleaned = cleaned.substring(1);
    if (cleaned.endsWith('}'))   cleaned = cleaned.substring(0, cleaned.length - 1);

    // Split on ", " that is followed by a key= pattern (word-chars / dashes then '=')
    const pairs = cleaned.split(/,\s*(?=[\w-]+=)/);
    for (const pair of pairs) {
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const key   = pair.substring(0, eq).trim();
        const value = pair.substring(eq + 1).trim();
        headers.set(key, value);
      }
    }
    return headers;
  }

  /**
   * Builds a cURL command from the parsed components.
   * Uses POST when a request body is present, GET otherwise.
   */
  function buildCurl(url, headers, body) {
    const hasBody = body && body.trim().length > 0;
    const method  = hasBody ? 'POST' : 'GET';

    let sb = `curl -X ${method} \\\n  '${url}'`;

    for (const [key, value] of headers) {
      sb += ` \\\n  -H '${key}: ${value}'`;
    }

    if (hasBody) {
      sb += ` \\\n  -d '${body}'`;
    }

    return sb;
  }

  // ── public API ─────────────────────────────────────────────────────
  return { fromAuditLog };
})();

