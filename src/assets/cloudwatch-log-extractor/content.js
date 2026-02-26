(function () {
    'use strict';
     function onMatchingHash() {
        const hash = window.location.hash;
        if (hash.startsWith('#logsV2:log-groups')) {
            // Create top control button
            const topButton = document.createElement('button');
            topButton.textContent = 'Extract cURL';
            topButton.id = 'add-table-buttons';
            Object.assign(topButton.style, {
                position: 'fixed',
                top: '10px',
                right: '10px',
                zIndex: '9999',
                backgroundColor: '#FF0000',
                color: '#fff',
                padding: '10px 15px',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
            });

            document.body.appendChild(topButton);

            topButton.addEventListener('click', async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    extract(text);
                } catch (err) {
                    console.error('Failed to read clipboard: ', err);
                }
            });
        }
    }

    onMatchingHash();

    function extract(logInput){
       // 1. Extract JSON part from log
        const jsonMatch = logInput.match(/{.*}/s); // Match first {...}
        if (!jsonMatch) {
            console.error("No JSON found in log");
            return;
        }

        let json;
        try {
            json = JSON.parse(jsonMatch[0]);
        } catch (err) {
            console.error("Invalid JSON:", err);
            return;
        }

        // 2. Parse the request
        const url = json.requestURL;
        const body = json.requestBody;
        const headersRaw = json.requestHeader || "";

        // 3. Parse headers (string to object)
        const headers = {};
        let lastKey = null;

        headersRaw
            .replace(/^{|}$/g, "") // remove braces
            .split(",")
            .forEach(kv => {
            if (kv.includes("=")) {
                const [key, ...valParts] = kv.trim().split("=");
                lastKey = key.trim();
                headers[lastKey] = valParts.join("=").trim();
            } else if (lastKey) {
                headers[lastKey] += "," + kv.trim();
            }
        });

        // 4. Build curl command
        let curl = `curl -X ${body ? "POST" : "GET"} '${url}' \\\n`;

        for (const [k, v] of Object.entries(headers)) {
            curl += `  -H '${k}: ${v}' \\\n`;
        }

        if (body) {
            curl += `  -d '${body}'`;
        } else {
            curl = curl.trim().replace(/\\$/, ""); // remove last backslash
        }

        // 4. Copy to clipboard & alert
        navigator.clipboard.writeText(curl).then(() => {
            alert("The cURL in your clipboard! ✅");
            console.log(curl);
        }).catch(err => {
            alert("❌ Failed to copy the cURL command.");
            console.error(err);
        });
    }
})();