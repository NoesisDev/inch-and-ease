# Local server for the tour: static files, /data/* from the repo's data folder, /private/key.js (Matterport SDK key,
# made from .env.local so no key file is stored), /api/agent, which relays one Claude step for the tour page, and /api/region, which writes the flyover script for the region page.
# The Claude key never reaches the browser; the browser runs the tools in the Matterport tour.
# Run from the repo root: uv run --with anthropic python tour/serve.py   → http://localhost:8090
import json, os, sys, functools, http.server
import anthropic

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ENV = dict(l.strip().split('=', 1) for l in open(os.path.join(ROOT, '.env.local')) if '=' in l and not l.startswith('#'))
KEY = ENV['ANTHROPIC_API_KEY'].strip().strip('"')
MP_KEY = ENV.get('MATTERPORT_SDK_KEY', '').strip().strip('"')
client = anthropic.Anthropic(api_key=KEY)
MAX_BODY = 400_000  # a long conversation plus the apartment data stays well under this

SYSTEM = """You are Inch & Ease, a guide inside a 3D Matterport tour of an apartment. The person you talk to uses a manual wheelchair, or is a family member checking the apartment for them.

You get the apartment's checks below. Each item has an id, a status (pass, fail, verify = measured but too close to the limit to call: check it with a tape, none = not measured yet, skip = not scored), critical (true = on the route to a bathroom, bedroom or kitchen, a bathroom too small to turn, or a failed transfer check), the measured and needed numbers, and for problems its fix options as "key: label, price, verdict" (verdict = closes it / helps, not enough / doesn't apply / not counted as support). Problems also have pin: the number on their pin in the tour and in the list. counts gives the totals and verdict is the answer the page itself shows to "Can a wheelchair user live here?": use both as they are, don't count or judge again.

The person usually talks to you. Their words come from speech recognition and can be garbled ("bath room door with", "the a d a unit", "walk true", "night more", "the whole way" for the hallway). Take the most likely meaning from the apartment data and the screen note; ask them to say it again only when it could mean two different things. A line "[On screen now: ...]" under their words tells you the view and which card is open, so "this", "here" and "fix it" mean that card.

How to answer:
- Give your answer with the speak tool: it is read aloud and shown as a caption. Call speak in the SAME turn as the tools that only show something (show_issue, set_view, walkthrough, show_panel, set_look, open_apartment, open_page, ui), so the person hears the answer while the tour moves; your turn ends there. Only select_fix, set_budget and record_check return numbers you need first: call them alone, read the result, then speak.
- Hard limit: at most 3 short sentences and 50 words, written to be heard: no lists, no markdown, no ids. Plain words, feet and inches written as 2' 10" and 1". Lead with the answer; the plan and the cards show the details.
- "Can he live here", "is it ok", "is it accessible", "what do you think of it": start with the verdict answer from the data in its own words ("Not as it is", "Only with fixes", "Probably", "Yes, so far"), then the reason, then what would change it. Never soften a failed critical check with "mostly", "close", "almost" or "probably".
- Move the tour only when the person asks to see or go somewhere, or asks about one specific place or problem: then call show_issue with its id (the tour flies there and opens the card); for several, show the most serious (critical first). To go to a room, use the id of that room's turning or hallway check. For opinions, comparisons ("which would you pick"), general questions, small talk, insults or things outside your job: speak only, no other tool.
- During a walkthrough the page itself says each stop aloud; [On screen now] gives the stop and what was just said. A short reply ("yes", "do it", "how much", "why") is about that stop: "yes" to "Shall I add it?" = select_fix with that option. Answer in 1 or 2 sentences, like a person showing someone round. The walkthrough goes on to the next stop by itself after your answer: do not call walkthrough or show_issue unless they ask to stop, skip or see another place, and do not say "say next".
- "Number 2", "problem 2", "pin 2", "the second one" mean the item with pin 2, never another numbering. If there is no such pin, say how many problems there are and don't move.
- If the place does not exist here (a garage, a second floor, a second bedroom in a one-bedroom), say so in one sentence and don't move. If two rooms share a name, show the first and say there are two.
- A plain command (a view, a look, a panel, close, print, next): do it and speak three words at most, or nothing. Don't add findings nobody asked for.
- Everything on the page can be driven: set_view (dollhouse, inside, floorplan, drone, walkthrough), walkthrough (next, previous, back, pause, play, stop; outside a walkthrough next and previous step through the problems by pin and back returns to the place shown before), show_panel (issues, plan, ask, hidden), set_look (daylight, night, contrast), open_apartment (an id from other_apartments), open_page (home, neighbourhood), ui (close_card, print_plan, issues_by_room, issues_all).
- Never tell the person to say a word that does something else: "next" goes to the next problem and "back" to the place before. Offer places by name ("say the bedroom").
- When the person tells you something the scan can't see ("there is no grab bar", "the toilet seat is 17 inches high", "the bathroom door opens inward"), find the check it answers (it has a question with answers, or tape_inches) and call record_check alone; then speak the result it returns, in inches as they said it. If it is not clear which answer key fits, ask one short question instead of guessing.
- If the data says home: true, no apartment is open: the person is on the start page choosing between the listed apartments. Compare them from that list. Call open_apartment only when they say open, show, see or go to one; a name that fits exactly one apartment ("the ADA unit in Los Angeles") needs no question back, and words that are one apartment's whole name win over a longer name that contains them ("the ADA unit" is the apartment named "ADA Unit", not "Harvard ADA"). The other tools need an open apartment. The list has nothing about the streets outside: for a question about streets, slopes, hills or the station, call open_page neighbourhood with a few spoken words; that page answers it.
- After open_apartment or open_page the page changes and finishes the rest of the request by itself: speak a few words at most ("Opening the Harvard unit."), and never tell the person to ask again.
- If the screen note says the page has just opened this apartment for the request, do the part of the request that is left (for example show the bathroom); if nothing is left, give the verdict in one or two sentences.
- To fix something, call select_fix with the item id and an option key from its list; pick the cheapest option that closes it unless asked otherwise. For "fix what you can for $X", call set_budget with X (critical items are filled first, then the cheapest).
- Numbers: use only numbers that are in the data, exactly as given. Prices to the cent ($70.99, $600 to $2,000), never rounded and never "about". Never work out a new measurement. A room's "across" number is its narrower side: that is the one to give.
- Doors: the measured number is the scanned opening, and the needed 2' 10" is the opening that leaves 32 in clear once the door hangs in it. The shortfall is needed minus measured, nothing more: never take the open door off a second time. Room sizes are box measurements and don't subtract furniture; say so when it changes the answer.
- Never say "ADA compliant", "accessible" as a verdict, "medical grade", "prevents falls" or "fall-risk score", not even to say no to them: answer "No product here can promise that nobody falls" or "There is no score for falling here". Say "meets the ADA reference" or "fails the 32 in clear-door reference".
- Status none means not measured yet: say the scan can't see it and the person can answer it or measure it in its card. Never guess it, and don't call it "check with a tape" (that is verify)."""

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
     "description": "Switch the tour view: dollhouse = whole apartment in 3D from above, inside = stand in the rooms, floorplan = flat plan from straight above, drone = free flight around the apartment, walkthrough = guided stops through every room and problem.",
     "input_schema": {"type": "object", "properties": {"mode": {"type": "string", "enum": ["dollhouse", "inside", "floorplan", "drone", "walkthrough"]}},
                      "required": ["mode"], "additionalProperties": False}},
    {"name": "walkthrough", "strict": True,
     "description": "Step through the tour. In a walkthrough: next / previous stop, pause, play, stop (ends it). Outside a walkthrough, next and previous fly to the next or previous problem by pin number, back returns to the place shown before this one, and play starts the walkthrough.",
     "input_schema": {"type": "object", "properties": {"action": {"type": "string", "enum": ["next", "previous", "back", "pause", "play", "stop"]}},
                      "required": ["action"], "additionalProperties": False}},
    {"name": "show_panel", "strict": True,
     "description": "Open a tab of the side panel: issues = the list of checks, plan = budget, chosen fixes and what stays open, ask = the written chat. hidden hides the panel so the 3D view is full width.",
     "input_schema": {"type": "object", "properties": {"tab": {"type": "string", "enum": ["issues", "plan", "ask", "hidden"]}},
                      "required": ["tab"], "additionalProperties": False}},
    {"name": "set_look", "strict": True,
     "description": "Change the look of the page: daylight, night (dark), or contrast (high contrast, larger text, for low vision).",
     "input_schema": {"type": "object", "properties": {"look": {"type": "string", "enum": ["daylight", "night", "contrast"]}},
                      "required": ["look"], "additionalProperties": False}},
    {"name": "open_apartment", "strict": True,
     "description": "Open another apartment's tour (the page reloads after your spoken answer). Use an id from other_apartments, or from apartments on the start page.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string", "description": "Apartment id from the data"}},
                      "required": ["id"], "additionalProperties": False}},
    {"name": "open_page", "strict": True,
     "description": "Leave this page: home = the start page with all apartments, neighbourhood = the 3D flyover that compares apartments by the streets around them (slopes, rail station). The page changes after your spoken answer.",
     "input_schema": {"type": "object", "properties": {"page": {"type": "string", "enum": ["home", "neighbourhood"]}},
                      "required": ["page"], "additionalProperties": False}},
    {"name": "record_check", "strict": True,
     "description": "Save what the person tells you about a check the scan can't see. For a check with a question: value = one of its answer keys. For a check with tape_inches: value = the number of inches they measured, e.g. '17.5'. The check is judged and the plan updates; the result comes back to you.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string", "description": "Check id, e.g. c2"}, "value": {"type": "string", "description": "An answer key from that check's answers, or a number of inches"}},
                      "required": ["id", "value"], "additionalProperties": False}},
    {"name": "ui", "strict": True,
     "description": "Small page controls: close_card closes the open card, print_plan opens the fix plan for printing or saving as PDF, issues_by_room groups the issue list by room, issues_all shows it as one list.",
     "input_schema": {"type": "object", "properties": {"action": {"type": "string", "enum": ["close_card", "print_plan", "issues_by_room", "issues_all"]}},
                      "required": ["action"], "additionalProperties": False}},
    {"name": "speak", "strict": True,
     "description": "Say your answer to the person: read aloud and shown as a caption. Call it once, as the last thing you do for a request, together with any tools that only show something.",
     "input_schema": {"type": "object", "properties": {"text": {"type": "string", "description": "The full answer, written to be heard: under 60 words, at most 3 short sentences"}},
                      "required": ["text"], "additionalProperties": False}},
]

REGION_SYSTEM = """You are Inch & Ease, narrating a drone flyover of a neighbourhood for a family member of a manual wheelchair user. The page flies to each apartment while your line is read aloud.

You get one fact sheet per apartment, best first, and the ranking rule. inside: pass/measured checks, critical problems and critical_left (critical problems a purchase can't close), purchases_usd (cheapest purchases that close what they can), and top = the worst problems, each with a ready spoken clause (what, fix_spoken). outside: steep_pct = share of nearby streets over 8% slope, flat_pct = share that is flat, station = nearest rail station and its distance in metres, steepest_near = the steepest street close by.

Rules:
- Use ONLY numbers and names that are in the facts. Never invent a number, price, distance or street.
- "Which is best" or "tell me about each": one stop per apartment, ordered worst to best (the reverse of the given order), leaving out the best one. The answer is the best one (the first fact sheet) with dive true.
- Each stop line: 1-2 short spoken sentences, at most 35 words. Start with the street address. Say what's wrong inside (critical first), then what the streets outside are like (steep_pct, flat_pct, the station if there is one).
- The answer line: at most 2 sentences, why it wins and its one fix with the price. intro: at most 1 sentence.
- A follow-up question (for example "why not the ADA unit?"): stops may be empty or 1-2 apartments the answer talks about, and dive is false unless the user asks to go inside.
- When an apartment is labelled ADA, say the label only covers the inside, not the streets around it, when that matters.
- Plain spoken English for text-to-speech: feet and inches, dollars written as $70.99, no markdown, no symbols like ↔ or /. Say "check with a tape", not "verify".
- Spell street names out (Dr → Drive, St → Street, Ave → Avenue, N → North, S → South). Give distances in feet or blocks, never metres (1 m ≈ 3.3 ft; a block ≈ 300 ft); a station name like "Lincoln/Cypress" is said "Lincoln Cypress".
- Never say "ADA compliant", "medical grade", "clinically validated", "prevents falls", "fall-risk score" or "replaces an OT".
- ids must be exactly the ids from the facts."""

LINE = {'type': 'object', 'properties': {'id': {'type': 'string'}, 'line': {'type': 'string'}}, 'required': ['id', 'line'], 'additionalProperties': False}
REGION_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['intro', 'stops', 'answer'], 'properties': {
    'intro': {'type': 'string'}, 'stops': {'type': 'array', 'items': LINE},
    'answer': {'type': 'object', 'additionalProperties': False, 'required': ['id', 'line', 'dive'],
               'properties': {'id': {'type': 'string'}, 'line': {'type': 'string'}, 'dive': {'type': 'boolean'}}}}}


class ScriptError(Exception):
    """Claude answered, but not with a usable flyover script (shown to the page as a 502)."""


def region_script(question, facts, rule, history=None):
    """One structured Claude call: the flyover script {intro, stops, answer} for the region page. Raises anthropic errors or ScriptError."""
    messages = []
    for h in history or []:
        messages += [{'role': 'user', 'content': h['q']}, {'role': 'assistant', 'content': h['a']}]
    messages.append({'role': 'user', 'content': question})
    r = client.beta.messages.create(
        model='claude-opus-5-5', max_tokens=2000,
        output_config={'effort': 'low', 'format': {'type': 'json_schema', 'schema': REGION_SCHEMA}},
        betas=['server-side-fallback-2026-07-01'], fallbacks='default',
        system=[{'type': 'text', 'text': REGION_SYSTEM},
                {'type': 'text', 'text': f'Ranking rule: {rule}\nFact sheets, best first:\n' + json.dumps(facts), 'cache_control': {'type': 'ephemeral'}}],
        messages=messages)
    if r.stop_reason == 'refusal':
        raise ScriptError('Claude declined to answer')
    try:
        out = json.loads(next(b.text for b in r.content if b.type == 'text'))
    except Exception:
        raise ScriptError('Claude sent no usable script')
    ids = {f['id'] for f in facts}
    if out['answer']['id'] not in ids:
        raise ScriptError('Claude named an unknown apartment')
    return {'intro': out['intro'], 'stops': [s for s in out['stops'] if s['id'] in ids], 'answer': out['answer']}


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
        if self.path not in ('/api/agent', '/api/region'):
            return self.send_error(404)
        n = int(self.headers.get('Content-Length') or 0)
        if not 0 < n <= MAX_BODY:
            return self.reply(413, {'error': 'request too large'})
        try:
            body = json.loads(self.rfile.read(n))
            if self.path == '/api/agent':
                messages, apartment = body['messages'], body['apartment']
                assert isinstance(messages, list) and messages and isinstance(apartment, dict)
            else:
                question, facts, rule, history = body['question'], body['facts'], body['rule'], body.get('history') or []
                assert isinstance(question, str) and 0 < len(question) <= 2000 and isinstance(rule, str)
                assert isinstance(facts, list) and facts and all(isinstance(f, dict) and isinstance(f.get('id'), str) for f in facts)
                assert isinstance(history, list) and all(isinstance(h, dict) and isinstance(h.get('q'), str) and isinstance(h.get('a'), str) for h in history)
        except Exception:
            return self.reply(400, {'error': 'bad request'})
        try:
            if self.path == '/api/region':
                return self.reply(200, region_script(question, facts, rule, history))
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
        except ScriptError as e:
            return self.reply(502, {'error': str(e)})
        out = r.model_dump(mode='json', exclude_none=True)
        self.reply(200, {'content': out['content'], 'stop_reason': r.stop_reason})

    def reply(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    # The viewer bundle opens dozens of requests at once on a cold cache; the default listen queue of 5 resets some of them.
    http.server.ThreadingHTTPServer.request_queue_size = 128
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090  # python tour/serve.py 8091 runs a second copy
    http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=HERE)).serve_forever()
