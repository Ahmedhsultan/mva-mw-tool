document.addEventListener('DOMContentLoaded', () => {
  const extractBtn = document.getElementById('extractBtn');
  const copyBtn = document.getElementById('copyBtn');
  const statusEl = document.getElementById('status');
  const resultBox = document.getElementById('resultBox');
  const resultPre = document.getElementById('resultPre');
  const fieldsContainer = document.getElementById('fieldsContainer');

  let extractedCurl = '';

  extractBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.trim().length === 0) {
        showStatus('Clipboard is empty. Copy a CloudWatch log entry first.', 'error');
        return;
      }
      parseLog(text);
    } catch (err) {
      showStatus('Could not read clipboard. Please allow clipboard access.', 'error');
    }
  });

  copyBtn.addEventListener('click', async () => {
    if (!extractedCurl) return;
    try {
      await navigator.clipboard.writeText(extractedCurl);
      showStatus('✅ cURL command copied to clipboard!', 'success');
    } catch (err) {
      showStatus('Failed to copy to clipboard.', 'error');
    }
  });

  function parseLog(raw) {
    fieldsContainer.innerHTML = '';
    resultBox.classList.remove('show');
    copyBtn.style.display = 'none';
    extractedCurl = '';

    try {
      // Try to find JSON objects in the log text
      const extracted = extractFields(raw);

      if (extracted.requestURL || extracted.curlCommand) {
        showFields(extracted);

        if (extracted.curlCommand) {
          extractedCurl = extracted.curlCommand;
          resultPre.textContent = extractedCurl;
          resultBox.classList.add('show');
          copyBtn.style.display = 'block';
        }

        showStatus('✅ Log extracted successfully!', 'success');
      } else {
        // Try to show raw parsed JSON
        const jsonObjects = extractJsonObjects(raw);
        if (jsonObjects.length > 0) {
          resultPre.textContent = JSON.stringify(jsonObjects, null, 2);
          resultBox.classList.add('show');
          showStatus('Extracted JSON from log. No requestURL found for cURL generation.', 'success');
        } else {
          showStatus('Could not find extractable log data. Make sure you copied a CloudWatch log entry.', 'error');
        }
      }
    } catch (err) {
      showStatus('Error parsing log: ' + err.message, 'error');
    }
  }

  function extractFields(raw) {
    const result = {
      requestURL: '',
      dalAPIName: '',
      requestType: '',
      success: '',
      responseHttpStatusCode: '',
      requestDurationMS: '',
      requestTime: '',
      requestHeader: '',
      requestBody: '',
      responseBody: '',
      curlCommand: '',
      guid: '',
      msisdn: '',
      errorCode: '',
      errorMessage: ''
    };

    // Extract JSON objects from the raw text
    const jsonObjects = extractJsonObjects(raw);

    for (const obj of jsonObjects) {
      if (obj.requestURL) result.requestURL = obj.requestURL;
      if (obj.dalAPIName) result.dalAPIName = obj.dalAPIName;
      if (obj.requestType) result.requestType = obj.requestType;
      if (obj.success !== undefined) result.success = String(obj.success);
      if (obj.responseHttpStatusCode) result.responseHttpStatusCode = obj.responseHttpStatusCode;
      if (obj.requestDurationMS) result.requestDurationMS = obj.requestDurationMS;
      if (obj.requestTime) result.requestTime = obj.requestTime;
      if (obj.requestHeader) result.requestHeader = obj.requestHeader;
      if (obj.requestBody) result.requestBody = obj.requestBody;
      if (obj.responseBody) result.responseBody = obj.responseBody;
      if (obj.guid) result.guid = obj.guid;
      if (obj.msisdn) result.msisdn = obj.msisdn;
      if (obj.errorCode) result.errorCode = obj.errorCode;
      if (obj.errorMessage) result.errorMessage = obj.errorMessage;
    }

    // Also try regex extraction from raw text for common fields
    if (!result.requestURL) {
      const urlMatch = raw.match(/"requestURL"\s*:\s*"([^"]+)"/);
      if (urlMatch) result.requestURL = urlMatch[1];
    }
    if (!result.dalAPIName) {
      const apiMatch = raw.match(/"dalAPIName"\s*:\s*"([^"]+)"/);
      if (apiMatch) result.dalAPIName = apiMatch[1];
    }
    if (!result.requestHeader) {
      const headerMatch = raw.match(/"requestHeader"\s*:\s*"([^"]+)"/);
      if (headerMatch) result.requestHeader = headerMatch[1];
    }
    if (!result.responseHttpStatusCode) {
      const statusMatch = raw.match(/"responseHttpStatusCode"\s*:\s*"([^"]+)"/);
      if (statusMatch) result.responseHttpStatusCode = statusMatch[1];
    }
    if (!result.requestBody) {
      const bodyMatch = raw.match(/"requestBody"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
      if (bodyMatch) result.requestBody = bodyMatch[1];
    }

    // Build cURL command
    if (result.requestURL) {
      result.curlCommand = buildCurl(result);
    }

    return result;
  }

  function extractJsonObjects(text) {
    const objects = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const candidate = text.substring(start, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            objects.push(parsed);
          } catch (e) {
            // Try to fix common issues: escaped quotes, etc.
            try {
              const fixed = candidate.replace(/\\"/g, '"').replace(/"{/g, '{').replace(/}"/g, '}');
              const parsed = JSON.parse(fixed);
              objects.push(parsed);
            } catch (e2) {
              // Skip unparseable
            }
          }
          start = -1;
        }
      }
    }
    return objects;
  }

  function buildCurl(fields) {
    let curl = `curl -X GET '${fields.requestURL}'`;

    // Parse headers from requestHeader
    if (fields.requestHeader) {
      try {
        // requestHeader is often a stringified JSON with brackets
        let headerStr = fields.requestHeader;
        // Try to extract key-value pairs
        const headerPairs = headerStr.match(/([^:,\[\]]+):([^,\[\]]+)/g);
        if (headerPairs) {
          for (const pair of headerPairs) {
            const colonIdx = pair.indexOf(':');
            const key = pair.substring(0, colonIdx).trim().replace(/["\s]/g, '');
            const value = pair.substring(colonIdx + 1).trim().replace(/["\s]/g, '');
            if (key && value && !key.startsWith('Host')) {
              curl += ` \\\n  -H '${key}: ${value}'`;
            }
          }
        }
      } catch (e) {
        // Add raw header
        curl += ` \\\n  -H '${fields.requestHeader}'`;
      }
    }

    // Add content type if we have a body
    if (fields.requestBody && fields.requestBody.trim().length > 0 && fields.requestBody !== 'null') {
      curl = curl.replace('-X GET', '-X POST');
      curl += ` \\\n  -H 'Content-Type: application/json'`;
      curl += ` \\\n  -d '${fields.requestBody}'`;
    }

    return curl;
  }

  function showFields(data) {
    const displayFields = [
      { key: 'dalAPIName', label: 'API Name' },
      { key: 'requestURL', label: 'Request URL' },
      { key: 'requestType', label: 'Request Type' },
      { key: 'responseHttpStatusCode', label: 'Status Code' },
      { key: 'success', label: 'Success' },
      { key: 'requestDurationMS', label: 'Duration (ms)' },
      { key: 'requestTime', label: 'Request Time' },
      { key: 'guid', label: 'GUID' },
      { key: 'msisdn', label: 'MSISDN' },
      { key: 'errorCode', label: 'Error Code' },
      { key: 'errorMessage', label: 'Error Message' },
    ];

    let html = '<div class="section-label">Extracted Fields</div>';

    for (const field of displayFields) {
      const value = data[field.key];
      if (value && value !== 'null' && value !== 'undefined') {
        html += `
          <div class="extracted-field">
            <span class="label">${field.label}</span>
            <span class="value">${escapeHtml(String(value))}</span>
          </div>`;
      }
    }

    fieldsContainer.innerHTML = html;
  }

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status show ${type}`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
