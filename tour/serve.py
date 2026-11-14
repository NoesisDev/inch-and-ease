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

You get the apartment's 21 checks below. Each item has an id, a check number n, a status (pass, fail, verify = check with a tape, none = not measured yet, skip = not scored), critical (true = on the route to a bathroom, bedroom or kitchen, a bathroom too small to turn, or a failed transfer check), the measured and needed numbers, and for problems its fix options as "key: label, price, verdict" (verdict = closes it / helps, not enough / doesn't apply / not counted as support).

How to answer:
- Act on the tour, don't only talk. For a place or a problem, call show_issue with its id first (the tour flies there and opens the card); for several, show the most serious (critical first).
- To fix something, call select_fix with the item id and an option key from its list; pick the cheapest option that closes it unless asked otherwise. For "fix what you can for $X", call set_budget with X (critical items are filled first, then the cheapest).
- Use set_view "dollhouse" for an overview of the whole apartment.
- Hard limit: 3 short sentences, under 60 words. Plain words, feet and inches. Lead with the answer (yes / no / tight); the plan and the cards show the details.
- Use only the numbers given. Door widths are the scanned opening; an open door leaves about 1.5-2 in less. Room sizes are box measurements and don't subtract furniture. Say so when it changes the answer.
- Never say "ADA compliant", "accessible" as a verdict, "medical grade", "prevents falls" or "fall-risk score". Say "meets the ADA reference" or "fails the 32 in clear-door reference".
- Status none means not measured yet: say the scan can't see it and the person can answer or measure it in the card. Never guess it."""

TOOLS = [
    {"name": "show_issue", "strict": True,
     "description": "Fly the 3D tour to one measured check and open its card (photo from the tour, numbers, to-scale drawing). Use the id from the apartment data.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string", "description": "Check id, e.g. door-3 or turn-1"}},
                      "required": ["id"], "additionalProperties": False}},
    {"name": "select_fix", "strict": True,
     "description": "Choose one fix option for one problem. The plan total, the re-check and the 3D colour update, and the card opens. Use an option key from that item's options, or 'none' to un-choose.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string", "description": "Problem id, e.g. door-3"}, "option": {"type": "string", "description": "Option key, e.g. 8.1.offset-hinge-..., or none"}},
                      "required": ["id", "option"], "additionalProperties": False}},
    {"name": "set_budget", "strict": True,
     "description": "Set the money available for purchases (null clears it). The plan fills critical problems first, then the cheapest, and the Plan tab opens.",
     "input_schema": {"type": "object", "properties": {"usd": {"type": ["number", "null"], "description": "Budget in US dollars, or null for no budget"}},
                      "required": ["usd"], "additionalProperties": False}},
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
    # The viewer bundle opens dozens of requests at once on a cold cache; the default listen queue of 5 resets some of them.
    http.server.ThreadingHTTPServer.request_queue_size = 128
    http.server.ThreadingHTTPServer(('127.0.0.1', 8090), functools.partial(Handler, directory=HERE)).serve_forever()
