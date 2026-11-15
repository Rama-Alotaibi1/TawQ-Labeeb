"""
Labeeb local server
-------------------
Serves the dashboard on http://127.0.0.1:8000 and relays SI (Azure OpenAI) calls
through this machine, so the browser never has to call Azure directly
(avoids "Failed to fetch" caused by CORS, ad-blockers or browser policies).

Run from the project folder:
    python tools/serve.py
Then open http://127.0.0.1:8000

Your Azure key stays in your browser and is only forwarded to your Azure endpoint.
Standard library only - nothing to install.
"""
import http.server, json, os, socketserver, ssl, urllib.error, urllib.parse, urllib.request, webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("LABEEB_PORT", "8000"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if "/proxy/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/proxy/azure":
            return self._send(404, json.dumps({"error": "not found"}))
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            endpoint = req["endpoint"].rstrip("/")
            host = urllib.parse.urlparse(endpoint).hostname or ""
            # only forward to Azure hosts
            if not endpoint.startswith("https://") or not any(host.endswith(d) for d in (
                    ".openai.azure.com", ".cognitiveservices.azure.com", ".services.ai.azure.com")):
                return self._send(400, json.dumps({"error": "endpoint must be an Azure OpenAI https URL"}))
            if req.get("v1"):
                url = "%s/openai/v1/chat/completions" % endpoint
            else:
                url = "%s/openai/deployments/%s/chat/completions?api-version=%s" % (
                    endpoint, urllib.parse.quote(req["deployment"]), urllib.parse.quote(req.get("apiVersion") or "2025-04-01-preview"))
            fwd = urllib.request.Request(url, data=json.dumps(req["body"]).encode("utf-8"), method="POST",
                                         headers={"Content-Type": "application/json", "api-key": req["key"]})
            try:
                with urllib.request.urlopen(fwd, timeout=60, context=ssl.create_default_context()) as r:
                    return self._send(r.status, r.read())
            except urllib.error.HTTPError as e:
                return self._send(e.code, e.read() or json.dumps({"error": str(e)}))
        except Exception as e:  # network error, bad JSON, missing field
            return self._send(502, json.dumps({"error": type(e).__name__ + ": " + str(e)}))


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = "http://127.0.0.1:%d" % PORT
        print("Labeeb running at", url, "  (Ctrl+C to stop)")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        httpd.serve_forever()
