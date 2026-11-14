# Local server for the tour: static files, /data/* from the repo's data folder, /private/key.js (Matterport SDK key,
# made from .env.local so no key file is stored), and /api/agent, which relays one Claude step for the tour page.
# The Claude key never reaches the browser; the browser runs the tools in the Matterport tour.
# Run from the repo root: uv run --with anthropic python tour/serve.py   → http://localhost:8090
import json, os, functools, http.server
import anthropic

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ENV = dict(l.strip().split('=', 1) for l in open(os.path.join(ROOT, '.env.local')) if '=' in l and not l.startswith('#'))
KEY = ENV['ANTHROPIC_API_KEY'].strip().strip('"')
MP_KEY = ENV.get('MATTERPORT_SDK_KEY', '').strip().strip('"')
client = anthropic.Anthropic(api_key=KEY)
MAX_BODY = 400_000  # a long conversation plus the apartment data stays well under this

SYSTEM = """You are Inch & Ease, a guide inside a 3D Matterport tour of an apartment. The person you talk to uses a manual wheelchair, or is a family member checking the apartment for them.

You get the apartment's measured checks below. Each has an id, a status (pass, fail, or verify = too close to call, check with a tape), and the measured numbers.

How to answer:
- When the question is about a place or a problem, call show_issue with the matching id first, so the tour flies there and opens the card, then answer. If several problems matter, show the most serious one.
- Use set_view "dollhouse" when they ask for an overview of the whole apartment.
- Answer in at most 3 short sentences (under 60 words), plain words, feet and inches. Lead with the answer (yes / no / tight).
- Use only the numbers given. Door widths are the scanned opening; an open door leaves about 1.5-2 in less. Room sizes are box measurements and don't subtract furniture. Say so when it changes the answer.
- Never say "ADA compliant" or "accessible". Say "meets the ADA reference" or "fails the 32 in clear-door reference".
- If something isn't in the data (grab bars, counter height, lighting), say the scan doesn't measure it.
- Each failing check has a "fix": the cheapest renter-friendly product with its price, and the contractor option when no product closes the gap. When asked what it costs or how to fix it, give the product and price; say plainly when only a contractor fixes it."""

TOOLS = [
    {"name": "show_issue", "strict": True,
     "description": "Fly the 3D tour to one measured check and open its card (photo from the tour, numbers, to-scale drawing). Use the id from the apartment data.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string", "description": "Check id, e.g. door-3 or turn-1"}},
                      "required": ["id"], "additionalProperties": False}},
    {"name": "set_view", "strict": True,
     "description": "Switch the tour view: dollhouse = whole apartment from above, inside = walk-through.",
     "input_schema": {"type": "object", "properties": {"mode": {"type": "string", "enum": ["dollhouse", "inside"]}},
                      "required": ["mode"], "additionalProperties": False}},
]


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # /data/... is the repo's public dataset (products, photos), one level up from tour/
        if path.startswith('/data/') and '..' not in path:
            return os.path.join(ROOT, path.lstrip('/').split('?')[0])
        return super().translate_path(path)

    def do_GET(self):
        if self.path.split('?')[0] == '/private/key.js':  # localhost-only SDK key; never written to disk
            data = f'window.MP_KEY={json.dumps(MP_KEY)};'.encode()
            self.send_response(200); self.send_header('Content-Type', 'text/javascript'); self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data))); self.end_headers(); return self.wfile.write(data)
        super().do_GET()

    def do_POST(self):
        if self.path != '/api/agent':
            return self.send_error(404)
        n = int(self.headers.get('Content-Length') or 0)
        if not 0 < n <= MAX_BODY:
            return self.reply(413, {'error': 'request too large'})
        try:
            body = json.loads(self.rfile.read(n))
            messages, apartment = body['messages'], body['apartment']
            assert isinstance(messages, list) and messages and isinstance(apartment, dict)
        except Exception:
            return self.reply(400, {'error': 'bad request'})
        try:
            r = client.beta.messages.create(
                model='claude-opus-5-5', max_tokens=4000,
                output_config={'effort': 'low'},  # short chat turns; keeps the tour snappy
                betas=['server-side-fallback-2026-07-01'], fallbacks='default',
                system=[{'type': 'text', 'text': SYSTEM},
                        {'type': 'text', 'text': 'Apartment data:\n' + json.dumps(apartment), 'cache_control': {'type': 'ephemeral'}}],
                tools=TOOLS, messages=messages)
        except anthropic.RateLimitError:
            return self.reply(429, {'error': 'Claude is busy, try again in a few seconds'})
        except anthropic.APIStatusError as e:
            return self.reply(502, {'error': f'Claude API error {e.status_code}'})
        except anthropic.APIConnectionError:
            return self.reply(502, {'error': 'no connection to Claude'})
        out = r.model_dump(mode='json', exclude_none=True)
        self.reply(200, {'content': out['content'], 'stop_reason': r.stop_reason})

    def reply(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('127.0.0.1', 8090), functools.partial(Handler, directory=HERE)).serve_forever()
