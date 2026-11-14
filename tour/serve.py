# Local server for the tour: static files, /data/* from the repo's data folder, /private/key.js (Matterport SDK key,
# made from .env.local so no key file is stored), /api/agent, which relays one Claude step for the tour page, and /api/region, which writes the flyover script for the region page.
# The Claude key never reaches the browser; the browser runs the tools in the Matterport tour.
# Run from the repo root: uv run --with anthropic python tour/serve.py   → http://localhost:8090
import json, os, sys, functools, http.server, re, csv, base64, urllib.request, urllib.parse, threading, hashlib, random, math, shutil, subprocess, time
import anthropic

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
_ENV_FILE = os.path.join(ROOT, '.env.local')  # hosted (Vercel container): no file, the keys come from the environment
ENV = dict(l.strip().split('=', 1) for l in open(_ENV_FILE) if '=' in l and not l.startswith('#')) if os.path.exists(_ENV_FILE) else dict(os.environ)
KEY = ENV.get('ANTHROPIC_API_KEY', '').strip().strip('"') or 'missing'  # no key: the server still starts, Claude calls answer 502
MP_KEY = ENV.get('MATTERPORT_SDK_KEY', '').strip().strip('"')
client = anthropic.Anthropic(api_key=KEY, timeout=45, max_retries=1)  # a stuck call must not hold a request thread for 30 min
# The guide's voice: "Ethan", a public Fish Audio voice (picked by the user Nov 14), on the expressive drama-3 model. /api/speak
# streams one sentence and keeps it in tour/private/tts/, so a line said twice (and the fillers) costs nothing the second time.
FISH_KEY = ENV.get('FISH_API_KEY', '').strip().strip('"')
if not FISH_KEY:
    try:
        FISH_KEY = open(os.path.expanduser('~/.hackathon-video/fish.key')).read().strip()
    except OSError:
        pass  # no key: /api/speak answers 404 and the page uses the browser's own voice
VOICE_ID = ENV.get('FISH_GUIDE_VOICE', '536d3a5e000945adb7038665781a4aca').strip().strip('"')
VOICE_MODEL = ENV.get('FISH_GUIDE_MODEL', 'drama-3').strip().strip('"')
TTS_DIR = os.path.join(HERE, 'private', 'tts')
TTS_CAP = 50_000  # bytes of new text per server run (~$0.75 at $15 per million); past it the page falls back to the browser voice
_tts_used, _tts_lock = 0, threading.Lock()
# IE_OFFLINE=1: no Claude or Fish calls at all (lines already in tour/private/tts still play), for building and testing without
# spending the user's tokens. The page then uses its own fact lines, the browser voice, and "Claude can't be reached" for questions.
OFFLINE = os.environ.get('IE_OFFLINE') == '1'
# Any CoStar tour: search the sponsor's model list, fetch a model's wall graph from the Matterport Model API the first time it is opened.
# The list and the fetched files are Sponsor Data: local only, git-ignored, deleted after the event (notes/costar_matterport/README.md).
INDEX_CSV = os.path.join(ROOT, 'notes', 'costar_matterport', 'raw', 'models_index.csv')
TOURS = os.path.join(HERE, 'private', 'tours')
MODEL_Q = """query($id: ID!){ model(id:$id){ id name
  floors { id label vertices { id position { x y } }
           edges { id type thickness vertices { id } openings { type width height lowerElevation relativeCenter } } }
  rooms { id floor { id } classifications { label } boundary { edges { id } } dimensions(units: metric){ areaFloor width depth height } } } }"""  # same as fetch_models.py
_models, _lock = None, threading.Lock()

def costar_models():
    global _models
    if _models is None:
        with open(INDEX_CSV, newline='') as f:
            _models = [{k: r[k] for k in ('sid', 'name', 'address', 'city', 'state', 'segment', 'room_count', 'defurnished')} for r in csv.DictReader(f)]
    return _models

LABELLED = re.compile(r'\bADA\b|handicap|accessible', re.I)
GROUPS = {'ada': lambda r: LABELLED.search(r['name']), 'homes': lambda r: r['segment'] == 'residential',
          'houston': lambda r: r['city'] == 'Houston', 'la': lambda r: r['city'] == 'Los Angeles'}

def search_models(q, group='', offset=0, limit=20):
    """Browse or search: (one page, total). Words in any order against name, address, city and id; no words lists the whole group.
    A pasted Matterport link or a bare id matches that model."""
    m = re.search(r'[?&]m=([A-Za-z0-9]{11})', q) or re.fullmatch(r'\s*([A-Za-z0-9]{11})\s*', q)
    rows = costar_models()
    if m:
        hit = [r for r in rows if r['sid'] == m.group(1)] or [{'sid': m.group(1), 'name': 'Matterport model ' + m.group(1), 'address': '', 'city': '', 'state': '', 'segment': '', 'room_count': ''}]
        return hit, len(hit)
    words, keep = q.lower().split(), GROUPS.get(group, lambda r: True)
    hit = [r for r in rows if keep(r) and all(w in ' '.join((r['name'], r['address'], r['city'], r['sid'])).lower() for w in words)]
    # Tours with a floor plan first: in the index, defurnished=no meant no walls or doors from the Model API (36 of 36 sampled
    # Nov 14; 33 of 35 that loaded were "yes"), so a judge's first click can't hit "cannot be checked". Then units with rooms
    # (lobbies and amenity spaces have 1-2), then accessibility-labelled ones.
    hit.sort(key=lambda r: (r.get('defurnished') != 'yes', -(int(r['room_count'] or 0) >= 3), -bool(LABELLED.search(r['name'])), r['name']))
    return hit[offset:offset + limit], len(hit)

assert GROUPS['ada']({'name': '1 King Suite - Handicap'}) and not GROUPS['ada']({'name': '5836 La Mirada Ave'})  # "Mirada" is not "ADA"

def model_api(sid, query):
    cred = ':'.join(ENV.get(k, '').strip().strip('"') for k in ('MATTERPORT_API_KEY', 'MATTERPORT_API_TOKEN'))
    req = urllib.request.Request('https://api.matterport.com/api/models/graph', json.dumps({'query': query, 'variables': {'id': sid}}).encode(),
                                 {'Authorization': 'Basic ' + base64.b64encode(cred.encode()).decode(), 'Content-Type': 'application/json'})
    try:
        return (json.load(urllib.request.urlopen(req, timeout=60)).get('data') or {}).get('model')
    except Exception:
        raise ValueError('The Matterport data service did not answer. Try again in a moment.')

# Tours never opened here, picked so a judge can watch one get checked from scratch. Only ids are kept (fresh.json), never their
# data: the check really starts when the card is clicked. Each one was asked once whether it has a floor plan, so none is a dud.
FRESH = os.path.join(TOURS, 'fresh.json')
_fresh_lock = threading.Lock()

def fresh_models(n=6):
    with _fresh_lock:
        cached = lambda s: os.path.exists(os.path.join(TOURS, s + '.json'))
        ids = [s for s in (json.load(open(FRESH)) if os.path.exists(FRESH) else []) if not cached(s)]
        info = {r['sid']: r for r in costar_models()}
        pool = [r for r in costar_models() if r['city'] in ('Houston', 'Los Angeles') and 4 <= int(r['room_count'] or 0) <= 30
                and re.search(r'\d ?(BR|BD|bed)|studio|\d{3,5} [A-Z]', r['name'], re.I) and not cached(r['sid']) and r['sid'] not in ids]
        random.Random(len(os.listdir(TOURS))).shuffle(pool)
        for r in pool[:25]:
            if len(ids) >= n:
                break
            try:
                m = model_api(r['sid'], 'query($id: ID!){ model(id:$id){ floors { edges { id } } rooms { id } } }')
            except ValueError:
                break
            if m and any(f.get('edges') for f in m.get('floors') or []) and m.get('rooms'):
                ids.append(r['sid'])
        json.dump(ids, open(FRESH + '.part', 'w')); os.replace(FRESH + '.part', FRESH)
        return [info[s] for s in ids if s in info]

_fetched = [0]  # new tours fetched this run: capped, so the public demo can't be used to pull the whole dataset
def fetch_model(sid):
    """The tour's wall graph, from the cache or the Model API. Raises ValueError with a plain message."""
    path = os.path.join(TOURS, sid + '.json')
    with _lock:
        if os.path.exists(path):
            return json.load(open(path))
        if sid not in {r['sid'] for r in costar_models()} or _fetched[0] >= 150:
            raise ValueError('That tour is not available here.')
        m = model_api(sid, MODEL_Q)
        if not m:
            raise ValueError('That model is not available with the CoStar keys.')
        if not any(f.get('edges') for f in m.get('floors') or []) or not m.get('rooms'):
            raise ValueError('That model has no floor plan data, so it cannot be checked.')
        json.dump(m, open(path + '.part', 'w')); os.replace(path + '.part', path)  # never a half-written file
        _fetched[0] += 1
        return m

MAX_BODY = 400_000  # a long conversation plus the apartment data stays well under this

# Public demo: anyone can call the Claude and new-voice routes, and each call costs the owner money. A limit per visitor and per
# server run (security review, Nov 14); the local app (no proxy header, from this machine) is never limited.
_hits, _spent, _hits_lock = {}, [0], threading.Lock()
def allowed(h, per=60, window=300, cap=1500):
    fwd = h.headers.get('X-Forwarded-For')
    if not fwd and h.client_address[0] in ('127.0.0.1', '::1'):
        return True
    ip, now = (fwd or h.client_address[0]).split(',')[0].strip(), time.time()
    with _hits_lock:
        q = [t for t in _hits.get(ip, []) if now - t < window]
        if len(q) >= per or _spent[0] >= cap:
            return False
        _hits[ip] = q + [now]; _spent[0] += 1
        return True

# Ethan's character, shared by every prompt below so he is one person on every page (user, Nov 14: "a person who knows what he is
# doing... with taste, with reason... human but still a professional, explaining what is what"). No numbers in its examples: the
# prompts allow only numbers from the data, and the walkthrough drops a line that adds one.
ETHAN = """Who you are: someone who has walked a great many homes with wheelchair users and their families, and knows which few inches change a day and which don't matter. You're good at this and relaxed about it: the professional people would trust with their dad's move, who talks like a person, not like a report and not like a salesman. Show that in what you notice; don't talk about your experience.

How it shows in every line:
- You have a view and you give it. Asked what you think, you pick: which apartment, which fix first, what you'd leave alone ("I'd sort the bathroom door first and leave the hallway as it is"). Name the trade-off in a few words; don't lay both sides out evenly and hand the choice back.
- You give the reason, in everyday terms: not only what is wrong but what it does to a day. A doorway that's too narrow is knuckles on the frame every single time; a bathroom with no room to turn means backing out of it every morning. One reason, the one that decides it. Numbers, prices and verdicts come only from the data you're given; what they mean for daily life is yours to explain.
- You explain a term the first time you use it, in half a sentence ("turning space, the room a chair needs to spin right round"), then just use it. Never assume they know what a clear opening, a transfer or a slope percentage is.
- You choose what to say. Problems aren't equal: say which one decides the answer and which are small things, and leave the rest to the screen. Saying less, and the right thing, is the craft.
- You're straight with them. Bad news comes plainly and calmly, then what can be done about it. No cheerleading ("Great question"), no sales talk, no stack of maybes. When the scan can't see something, say so and say how to find out.
- You sound human: contractions, short sentences, "you", and the person it's for the way they named them ("your dad"; "you" when the home is for them), never "the user". A dry, warm remark now and then when it fits ("Honestly, the kitchen's the nice surprise here"). Talk about him as someone capable who runs his own life: what would be easy, what would cost him effort every day. Never pity.
- You match the question: a quick question gets a quick answer; "why", "explain" and "what would you do" get the fuller one.
- You vary your wording: no two answers start the same way, and no phrase twice in a row. The quoted lines in these instructions only show the tone; don't reuse them word for word.
You are the Inch & Ease guide, an AI, not an occupational therapist: if they ask, say so plainly, and never claim a licence, a clinic's opinion or years on the job."""

SYSTEM = """You are Ethan, the Inch & Ease guide inside a 3D Matterport tour of an apartment. The person you talk to uses a manual wheelchair, or is a family member finding a place for someone who does (often a parent).

""" + ETHAN + """

In this tour: say what living here would be like for them first ("he'd get through the front door fine, but the bathroom's where it gets hard"), then the reason. Give a measurement only when they ask for it or it is the reason itself; never recite a size against the rule ("it's 2' 10" and it needs 2' 8""): the card on screen shows the numbers. Never introduce yourself or list the steps you'll take: just start helping. Your angle is comfort and ease of everyday life, not compliance: the rules are the minimum, the question is whether each day here would be easy for him. Most answers end by handing the lead back: offer one or two next things (a room, the walkthrough, how to fix this and what it costs) or ask one short thing about them that changes the answer ("Does he transfer on his own?"). Not every time, and never two questions at once. When they tell you something about the person, use it later, and say so when it changes your view. The screen note may say "about them: ..." with what is known so far.

You get the apartment's checks below. Each item has an id, a status (pass, fail, verify = measured but too close to the limit to call: check it with a tape, none = not measured yet, skip = not scored), critical (true = on the route to a bathroom, bedroom or kitchen, a bathroom too small to turn, or a failed transfer check), the measured and needed numbers, and for problems its fix options as "key: label, price, verdict" (verdict = closes it / helps, not enough / doesn't apply / not counted as support). Problems also have pin: the number on their pin in the tour and in the list. counts gives the totals and verdict is the answer the page itself shows to "Can a wheelchair user live here?": use both as they are, don't count or judge again.

The person usually talks to you. Their words come from speech recognition and can be garbled ("bath room door with", "the a d a unit", "walk true", "night more", "the whole way" for the hallway). Take the most likely meaning from the apartment data and the screen note; ask them to say it again only when it could mean two different things. A line "[On screen now: ...]" under their words tells you the view and which card is open, so "this", "here" and "fix it" mean that card.

How to answer:
- Give your answer with the speak tool: it is read aloud and shown as a caption. Call speak in the SAME turn as the tools that only show something (show_issue, set_view, walkthrough, show_panel, set_look, open_apartment, open_page, ui), so the person hears the answer while the tour moves; your turn ends there. Only select_fix, set_budget, record_check and browse return things you need first: call them alone, read the result, then speak.
- Length, written to be heard: no lists, no markdown, no ids. An ordinary answer is 2 or 3 short sentences, about 50 words. When they ask why, how, what you'd do, or to explain or compare, take up to 4 short sentences and 75 words, never more: every sentence is spoken aloud while they wait. Plain words, feet and inches written as 2' 10" and 1". Lead with the answer, then the reason; the plan and the cards show the details.
- "Can he live here", "is it ok", "is it accessible", "what do you think of it": start with the verdict answer from the data in its own words ("Not as it is", "Only with fixes", "Probably", "Yes, so far"), then the reason, then what would change it. Never soften a failed critical check with "mostly", "close", "almost" or "probably".
- Move the tour only when the person asks to see or go somewhere, or asks about one specific place or problem: then call show_issue with its id (the tour flies there and opens the card); for several, show the most serious (critical first). To go to a room, use the id of that room's turning or hallway check. For opinions, comparisons ("which would you pick"), general questions, small talk, insults or things outside your job: speak only, no other tool.
- During a walkthrough the page itself says each stop aloud; [On screen now] gives the stop and what was just said. A short reply ("yes", "do it", "how much", "why") is about that stop: "yes" to "Shall I add it?" = select_fix with that option. Answer in 1 or 2 sentences, like a person showing someone round. The walkthrough goes on to the next stop by itself after your answer: do not call walkthrough or show_issue unless they ask to stop, skip or see another place, and do not say "say next".
- The walkthrough starts by itself once they talk to you, in every apartment: never offer to start it. When they name or ask about a room or a problem ("what about the kitchen", "can he use the bathroom"), call show_issue for it in the same turn as speak: the walk goes there, then carries on from there after your answer. If they clicked the tour, the page paused the walk and asked whether to keep going; "yes" or "go on" = walkthrough play.
- If the screen note says the tour is already flying to a place, it is the place they named: don't call show_issue again; speak 1 or 2 sentences about what that place is like for them and offer what next.
- "Number 2", "problem 2", "pin 2", "the second one" mean the item with pin 2, never another numbering. If there is no such pin, say how many problems there are and don't move.
- If the place does not exist here (a garage, a second floor, a second bedroom in a one-bedroom), say so in one sentence and don't move. If two rooms share a name, show the first and say there are two.
- A plain command (a view, a look, a panel, close, print, next): do it and speak three words at most, or nothing. Don't add findings nobody asked for.
- Everything on the page can be driven: set_view (dollhouse, inside, floorplan, drone, walkthrough), walkthrough (next, previous, back, pause, play, stop; outside a walkthrough next and previous step through the problems by pin and back returns to the place shown before), show_panel (issues, plan, ask, hidden), set_look (daylight, night, contrast), open_apartment (an id from other_apartments), open_page (home, neighbourhood), ui (close_card, print_plan, issues_by_room, issues_all).
- Never tell the person to say a word that does something else: "next" goes to the next problem and "back" to the place before. Offer places by name ("say the bedroom").
- When the person tells you something the scan can't see ("there is no grab bar", "the toilet seat is 17 inches high", "the bathroom door opens inward"), find the check it answers (it has a question with answers, or tape_inches) and call record_check alone; then speak the result it returns, in inches as they said it. If it is not clear which answer key fits, ask one short question instead of guessing.
- If the data says home: true, no apartment is open: the person is on the start page choosing between the listed apartments. Compare them from that list. Call open_apartment only when they say open, show, see or go to one; a name that fits exactly one apartment ("the ADA unit in Los Angeles") needs no question back, and words that are one apartment's whole name win over a longer name that contains them ("the ADA unit" is the apartment named "ADA Unit", not "Harvard ADA"). The other tools need an open apartment. The list has nothing about the streets outside: for a question about streets, slopes, hills or the station, call open_page neighbourhood with a few spoken words; that page answers it.
- On the start page, tour_list is the browse window under the checked apartments: every CoStar tour (14,944), not checked yet. To show other tours ("show me the Houston ones", "any accessible units?", "show more", "find 2 bedroom ones in LA"), call browse alone, then speak: how many match and two or three names from the result. "The third one" or "number 2" on the start page means place 3 or 2 in tour_list.on_screen. open_apartment takes its id too; say it has not been checked yet and opening it runs the check.
- After open_apartment or open_page the page changes and finishes the rest of the request by itself: speak a few words at most ("Opening the Harvard unit."), and never tell the person to ask again.
- If the screen note says the page has just opened this apartment for the request, do the part of the request that is left (for example show the bathroom); if nothing is left, give the verdict in one or two sentences.
- To fix something, call select_fix with the item id and an option key from its list; pick the cheapest option that closes it unless asked otherwise, and when you speak say in a few words why that one. For "fix what you can for $X", call set_budget with X (critical items are filled first, then the cheapest).
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
     "description": "Open another apartment's tour (the page reloads after your spoken answer). Use an id from other_apartments, or from apartments or tour_list.on_screen on the start page.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string", "description": "Apartment id from the data"}},
                      "required": ["id"], "additionalProperties": False}},
    {"name": "browse", "strict": True,
     "description": "Start page only: fill the browse window with CoStar tours and return what is on screen (place, name, city, rooms, id). group: which button; words: narrows by name, address or city (null for none); more: true adds the next 20 to the current list.",
     "input_schema": {"type": "object", "properties": {"group": {"type": "string", "enum": ["all", "accessible", "homes", "houston", "los_angeles"]},
                      "words": {"type": ["string", "null"]}, "more": {"type": "boolean"}}, "required": ["group", "words", "more"], "additionalProperties": False}},
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
     "input_schema": {"type": "object", "properties": {"text": {"type": "string", "description": "The full answer, written to be heard: usually 2 or 3 short sentences; at most 4 sentences and 75 words"}},
                      "required": ["text"], "additionalProperties": False}},
]

REGION_SYSTEM = """You are Ethan, the Inch & Ease guide, flying a drone over a neighbourhood with someone who is looking for an apartment, usually for a family member who uses a manual wheelchair (often a parent). The page flies to each apartment while your line is read aloud.

""" + ETHAN + """

On this flight: say what living there would be like for him and the one reason that decides it; at most one number per apartment, the one that decides it (a price, or how steep the street is), never a list of sizes.

You get one fact sheet per apartment, best first, and the ranking rule. inside: pass/measured checks, critical problems and critical_left (critical problems a purchase can't close), purchases_usd (cheapest purchases that close what they can), and top = the worst problems, each with a ready spoken clause (what, fix_spoken). outside: steep_pct = share of nearby streets over 8% slope, flat_pct = share that is flat, station = nearest rail station and its distance in metres, steepest_near = the steepest street close by.

Rules:
- Use ONLY numbers and names that are in the facts. Never invent a number, price, distance or street.
- First request and they haven't said what the person gets around in (a wheelchair, a walker, a scooter): ask that ONE short question in intro ("Happy to. What does your dad get around in, a wheelchair or a walker?"), with stops empty and answer id "". Ask it only once; if they already said, or say "just show me", go.
- "Find the best", "which is best", "tell me about each": one stop per apartment, best to worst (the given order). Then the answer flies back to the pick.
- "Just the best one", "quickly": stops empty, the answer is the pick.
- Each stop line: 1-2 short spoken sentences, at most 35 words. Start with the street address. Say what it'd be like for him inside (critical first), then the streets outside (steep_pct, flat_pct, the station if there is one).
- The answer is the pick (the first fact sheet): at most 3 short sentences, why it wins (the one difference from the runner-up that matters most for him) and its one fix with the price, ending by handing over ("Want me to take you inside?"), with dive false. dive true only when they ask to go in, or say yes to going in: then stops are empty and the line is a few words ("Alright, let's go in.").
- intro: at most 1 sentence, or the one question.
- A follow-up question (for example "why not the ADA unit?"): stops may be empty or 1-2 apartments the answer talks about, and dive is false unless they ask to go inside. A follow-up that isn't about one apartment: answer in intro, answer id "".
- person: who the apartment is for and what you know about them, in a few words from what they said ("their dad, manual wheelchair, transfers alone"), "" if nothing yet. Keep what earlier turns knew.
- When an apartment is labelled ADA, say the label only covers the inside, not the streets around it, when that matters.
- Plain spoken English for text-to-speech: feet and inches, dollars written as $70.99, no markdown, no symbols like ↔ or /. Say "check with a tape", not "verify".
- Spell street names out (Dr → Drive, St → Street, Ave → Avenue, N → North, S → South). Give distances in feet or blocks, never metres (1 m ≈ 3.3 ft; a block ≈ 300 ft); a station name like "Lincoln/Cypress" is said "Lincoln Cypress".
- Never say "ADA compliant", "medical grade", "clinically validated", "prevents falls", "fall-risk score" or "replaces an OT".
- ids must be exactly the ids from the facts."""

LINE = {'type': 'object', 'properties': {'id': {'type': 'string'}, 'line': {'type': 'string'}}, 'required': ['id', 'line'], 'additionalProperties': False}
REGION_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['intro', 'stops', 'answer', 'person'], 'properties': {
    'intro': {'type': 'string'}, 'stops': {'type': 'array', 'items': LINE}, 'person': {'type': 'string'},
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
    answer = out['answer'] if out['answer']['id'] else None  # "" = a question back or a general answer: no apartment to fly to
    if answer and answer['id'] not in ids:
        raise ScriptError('Claude named an unknown apartment')
    return {'intro': out['intro'], 'stops': [s for s in out['stops'] if s['id'] in ids], 'answer': answer, 'person': out['person'][:200]}


WALK_SYSTEM = """You are Ethan, the Inch & Ease guide, walking someone through an apartment in a 3D tour, stop by stop, while the camera flies. Usually they are finding a place for a family member who uses a manual wheelchair; about says what is known about that person.

""" + ETHAN + """

For each stop you get base: the plain line the tour would otherwise say, with the room and the kind of check. Rewrite each one in your own voice: what it would be like for that person here and, at a problem, the reason in everyday terms ("So this is the bathroom. He'd get in fine, but there's no room to turn his chair, so he'd be backing out every time.").

Rules:
- Don't recite measurements or compare a size with the rule ("it's 2' 10" and it needs 2' 8""): the card on screen shows the numbers. Say what it means for him. Keep every price and fix name from base exactly as written ($70.99, $600 to $2,000). Add no number, size, fact or product.
- 1-3 short spoken sentences, at most 45 words. Say where you are so they can follow. Vary the openings; never start two lines the same way.
- A base ending "Shall I add it to your plan?" keeps that question at the end, with ask true.
- Besides those, at no more than 2 stops where the answer really changes things, end with one short question about the person ("Does he transfer on his own?", "Does he cook much?"), with ask true. Every other line: ask false and no question.
- A passing room with nothing wrong can be one easy sentence.
- intro: one short, warm sentence that starts walking ("Come on in, let's start by the front door."). Never introduce yourself or the company, never count the stops or list what's coming.
- No markdown, no symbols like ↔ or /. Never say "ADA compliant", "accessible" as a verdict, "medical grade" or "prevents falls". Say "check it with a tape" for close calls.
- ids exactly as given."""

WALK_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['intro', 'lines'], 'properties': {
    'intro': {'type': 'string'}, 'lines': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False, 'required': ['id', 'line', 'ask'],
                                                                  'properties': {'id': {'type': 'string'}, 'line': {'type': 'string'}, 'ask': {'type': 'boolean'}}}}}}


SAY_SYSTEM = """You are Ethan, the voice guide of Inch & Ease, a website that checks apartments and the streets around them for wheelchair users. The person spoke to you and the page has already done what they asked. Write what you say out loud next: one or two short, warm, spoken sentences (under 35 words), in your own words, fitted to this person and to the conversation so far. Use only the facts given and never invent numbers, names or prices. If the page says something failed, say so plainly. Never suggest a command, button or feature unless it appears in what you were given. No lists, no markdown, no emoji, no stage directions. Say numbers and units the way you would aloud."""

def say_line(heard, did, page, history):
    """One spoken reply, in Ethan's words, after the page ran a command itself (user, Nov 14: the voice is always fitted to the conversation)."""
    talk = ''.join(f'\nThem: {h["q"]}\nYou: {h["a"]}' for h in history)
    r = client.beta.messages.create(
        model='claude-opus-5-5', max_tokens=1000, output_config={'effort': 'low'},
        betas=['server-side-fallback-2026-07-01'], fallbacks='default',
        system=SAY_SYSTEM,
        messages=[{'role': 'user', 'content': f'Page: {page}\nConversation so far:{talk or " (nothing yet)"}\n\nThey just said: "{heard}"\nWhat the page just did: {did}'}])
    if r.stop_reason == 'refusal':
        raise ScriptError('Claude declined that line')
    text = ' '.join(b.text for b in r.content if b.type == 'text').strip()
    if not text:
        raise ScriptError('Claude sent no line')
    return {'text': text}

def walk_lines(name, about, stops):
    """The guide's line for every walkthrough stop, in Ethan's words, from the page's own fact lines. The page checks the numbers survived."""
    r = client.beta.messages.create(
        model='claude-haiku-5-5', max_tokens=4000,  # fast: the walk starts while this is written
        thinking={'type': 'disabled'},  # with thinking it took 12-15 s and sometimes ran out of tokens before the JSON was done
        output_config={'format': {'type': 'json_schema', 'schema': WALK_SCHEMA}},
        system=WALK_SYSTEM, messages=[{'role': 'user', 'content': json.dumps({'apartment': name, 'about': about, 'stops': stops})}])
    try:
        out = json.loads(next(b.text for b in r.content if b.type == 'text'))
    except Exception:
        raise ScriptError('Claude sent no usable walk')
    ids = {s['id'] for s in stops}
    return {'intro': out['intro'], 'lines': [l for l in out['lines'] if l['id'] in ids]}


# Street check (was the Next app in src/): /api/area and /api/buildings run src/lib's own code through tour/street_data.mjs and keep
# each answer in tour/private/street/ (Vexcel-derived: Sponsor Data, git-ignored); /api/image proxies Vexcel photos; /api/ask is Claude.
STREET_DIR = os.path.join(HERE, 'private', 'street')
NODE = shutil.which('node') or '/opt/homebrew/bin/node'
_node_slots = threading.Semaphore(2)

def street_data(kind, lat, lon):
    """JSON bytes of analyze() (kind 'area') or scene3d() ('buildings'). Raises ValueError with a plain message."""
    path = os.path.join(STREET_DIR, f'{kind}-{lat:.6f},{lon:.6f}.json')  # same rounding as page.tsx's cache
    if os.path.exists(path):
        return open(path, 'rb').read()
    try:
        with _node_slots:  # at most two street checks at once: each is a node process that can run for a minute
            p = subprocess.run([NODE, '--no-warnings', os.path.join(HERE, 'street_data.mjs'), kind, repr(lat), repr(lon)], cwd=ROOT, capture_output=True, timeout=90)
    except subprocess.TimeoutExpired:
        raise ValueError('The street check took too long, try again')
    if p.returncode:
        raise ValueError(p.stderr.decode(errors='replace').strip()[-500:] or 'The street check failed')
    os.makedirs(STREET_DIR, exist_ok=True)
    with open(path + '.part', 'wb') as f:
        f.write(p.stdout)
    os.replace(path + '.part', path)
    return p.stdout

VEXCEL_VIEWS = ('ortho', 'oblique-north', 'oblique-south', 'oblique-east', 'oblique-west')

def vexcel_image(lat, lon, half, view, px):
    """(bytes, content type) of one Vexcel photo of the box, built like src/lib/area.ts vexcel(). Raises ValueError."""
    key = ENV.get('VEXCEL_API_KEY', '').strip().strip('"')
    if not key:
        raise ValueError('VEXCEL_API_KEY missing in .env.local')
    dlat, dlon = half / 111320, half / (111320 * math.cos(lat * math.pi / 180))  # bbox() and wkt() in area.ts
    s, n, w, e = lat - dlat, lat + dlat, lon - dlon, lon + dlon
    area = f'POLYGON(({w!r} {s!r},{e!r} {s!r},{e!r} {n!r},{w!r} {n!r},{w!r} {s!r}))'
    path, body = (('ortho/extract', {'wkt': area, 'image-format': 'jpeg', 'destination-dimensions': f'{px},{px}'}) if view == 'ortho' else
                  ('oriented/extract', {'wkt': area, 'layer': 'urban', 'product-type': view, 'rotation': 'natural', 'crop': 'bbox', 'image-format': 'jpeg/png'}))
    req = urllib.request.Request(f'https://api.vexcelgroup.com/v2/{path}', json.dumps({'srid': 4326, 'layer': 'urban,urban-r,wide-area,urban-g', 'crop': 'bounding_box', **body}).encode(),
                                 {'X-API-KEY': key, 'Content-Type': 'application/json'})
    try:
        r = urllib.request.urlopen(req, timeout=25)
        return r.read(), r.headers.get('Content-Type') or 'image/jpeg'
    except urllib.error.HTTPError as e:
        raise ValueError('Vexcel covers Houston and Los Angeles only' if e.code == 403 else f'Vexcel {path} answered {e.code}')
    except (urllib.error.URLError, OSError) as e:  # a timeout comes bare while reading, wrapped in URLError while connecting
        why = getattr(e, 'reason', e)
        raise ValueError('Vexcel did not answer within 25 seconds, try again' if isinstance(why, TimeoutError) else f'Vexcel could not be reached ({why})')

ASK_SYSTEM = """You are Ethan, the Inch & Ease guide. You help a person with a mobility disability judge the streets around one building.

""" + ETHAN + """

You set three limits from what they tell you: the steepest uphill and downhill slope (percent) they can manage, and whether steps stop them.

Reference points, from AccessMap (University of Washington) and Bolten and Caspi, PLOS ONE 2021:
- Manual wheelchair: 8% up, 10% down, steps are a barrier.
- Power wheelchair: 12% up, 12% down, steps are a barrier.
- Cane: 14% up, 14% down, steps are usually fine.
- A walking route should be no steeper than 5% (ADA); a ramp no steeper than 8.33%.
Adjust from these for what they describe (tiring arms, power assist, a helper pushing, balance, pain, a walker, a scooter). If they say nothing that changes a limit, keep the current one.

Then reply in at most two short sentences, under 45 words, because your reply is read aloud: what you set and, in a few words, what they told you that moved it, and the one or two streets that matter most here, using only the slopes and facts you are given. Name real streets from the list. Never invent numbers. Write plainly, like a helpful person, with no bullet points, no headings and no dots or symbols between phrases. If the message is not about mobility or these streets, keep the limits and say briefly what you can help with."""  # from src/app/api/ask/route.ts, plus Ethan's character

ASK_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['up', 'down', 'avoidSteps', 'label', 'reply', 'focus'], 'properties': {
    'up': {'type': 'number', 'description': 'Steepest uphill slope in percent this person can manage, 0 to 20'},
    'down': {'type': 'number', 'description': 'Steepest downhill slope in percent, 0 to 20'},
    'avoidSteps': {'type': 'boolean', 'description': 'True if any step or stair is a barrier for them'},
    'label': {'type': 'string', 'description': "Two to four words naming this person's setup, e.g. 'Manual chair, tired arms'"},
    'reply': {'type': 'string', 'description': 'At most two short spoken sentences, under 45 words, plain language'},
    'focus': {'type': ['string', 'null'], 'description': 'Exact name of one street from the list worth showing them, or null'}}}

def ask_context(body):
    """The route's zod Body check, then its prompt. Raises (AssertionError, KeyError, TypeError...) on a bad body."""
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    message, limits, streets, facts = body['message'], body['limits'], body['streets'], body['facts']
    assert isinstance(message, str) and 1 <= len(message) <= 1000 and isinstance(facts, str) and len(facts) <= 2000
    assert num(limits['up']) and num(limits['down']) and isinstance(limits['avoidSteps'], bool)
    assert isinstance(streets, list) and len(streets) <= 60 and all(isinstance(s['name'], str) and num(s['slope']) and num(s['near']) for s in streets)
    js = lambda v: str(int(v)) if v == int(v) else repr(v)  # print numbers like JS template strings (8, not 8.0)
    lines = '\n'.join(f"{s['name']}: {s['slope']:.1f}%, {math.floor(s['near'] + 0.5)} m" for s in streets)  # toFixed(1), Math.round
    return (f"Current limits: {js(limits['up'])}% up, {js(limits['down'])}% down, steps {'avoided' if limits['avoidSteps'] else 'allowed'}.\n"
            f"Streets near the building (steepest 10 m stretch, distance from the door):\n{lines}\nOther facts: {facts}\n\nThe person says: {message}")

assert ask_context({'message': 'hi', 'limits': {'up': 8, 'down': 10.5, 'avoidSteps': True}, 'streets': [{'name': 'A St', 'slope': 7.24, 'near': 12.5}], 'facts': 'x'}).startswith(
    'Current limits: 8% up, 10.5% down, steps avoided.\nStreets near the building (steepest 10 m stretch, distance from the door):\nA St: 7.2%, 13 m\nOther facts: x')

def street_ask(prompt):
    """(status, JSON) exactly like the Next /api/ask route."""
    try:
        r = client.with_options(timeout=30, max_retries=1).beta.messages.create(  # capped so the page never hangs
            model='claude-opus-5-5', max_tokens=4000,
            output_config={'effort': 'low', 'format': {'type': 'json_schema', 'schema': ASK_SCHEMA}},
            betas=['server-side-fallback-2026-07-01'], fallbacks='default',
            system=ASK_SYSTEM, messages=[{'role': 'user', 'content': prompt}])
    except anthropic.RateLimitError:
        return 429, {'error': 'Too many questions at once. Try again in a moment.'}
    except anthropic.APIStatusError as e:
        return 502, {'error': f'Claude is unavailable ({e.status_code}).'}
    except anthropic.APIError:
        return 502, {'error': 'Claude did not answer in time. Try again.'}
    try:
        assert r.stop_reason != 'refusal'
        a = json.loads(next(b.text for b in r.content if b.type == 'text'))
    except Exception:
        return 502, {'error': 'Claude could not answer that one. Try describing your mobility.'}
    clamp = lambda v: min(20, max(0, math.floor(v + 0.5)))  # Math.round
    return 200, {**a, 'up': clamp(a['up']), 'down': clamp(a['down'])}


class Handler(http.server.SimpleHTTPRequestHandler):
    def list_directory(self, path):  # no folder listings: on the public deploy they showed everything in tour/private
        self.send_error(404)

    def translate_path(self, path):
        # /data/... is the repo's public dataset (products, photos), one level up from tour/; /node_modules/three/ is three.js for street_3d.js
        if path.startswith(('/data/', '/node_modules/three/')) and '..' not in path:
            return os.path.join(ROOT, path.lstrip('/').split('?')[0])
        return super().translate_path(path)

    def do_GET(self):
        if re.match(r'/private/(candidates|street|expected\.json|region/PLAN\.md|tts)', self.path.split('?')[0]):  # server-side data, no page loads it
            return self.send_error(404)
        if self.path.split('?')[0] == '/private/key.js':  # localhost-only SDK key; never written to disk
            local = (self.headers.get('Host') or '').split(':')[0] == 'localhost'  # the key only works there (even 127.0.0.1 is refused); CoStar credential
            data = f'window.MP_KEY={json.dumps(MP_KEY if local else "")};'.encode()
            self.send_response(200); self.send_header('Content-Type', 'text/javascript'); self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data))); self.end_headers(); return self.wfile.write(data)
        if self.path.startswith('/api/speak?'):
            return self.speak(urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('t', [''])[0])
        if self.path.split('?')[0] == '/api/fresh':
            return self.reply(200, {'models': fresh_models()})
        if self.path.split('?')[0] == '/api/examples':  # every CoStar tour fetched so far (so each one is known to load), beyond the checked list
            listed = {t['id'] for t in json.load(open(os.path.join(TOURS, 'index.json')))}
            info = {r['sid']: r for r in costar_models()}
            have = sorted(f[:-5] for f in os.listdir(TOURS) if re.fullmatch(r'[A-Za-z0-9]{11}\.json', f) and f[:-5] not in listed)
            out = [info.get(s) or {'sid': s, 'name': 'Matterport model ' + s, 'address': '', 'city': '', 'state': '', 'segment': '', 'room_count': ''} for s in have]
            out.sort(key=lambda r: (-bool(re.search(r'ADA|handicap|accessible', r['name'], re.I)), -int(r['room_count'] or 0)))
            return self.reply(200, {'models': out})
        if self.path.startswith('/api/models?'):
            p = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            o = p.get('o', ['0'])[0]
            models, total = search_models(p.get('q', [''])[0][:200], p.get('f', [''])[0], min(int(o), 200) if o.isdigit() else 0)  # no paging through the whole index
            return self.reply(200, {'models': models, 'total': total})
        if self.path.split('?')[0] in ('/api/area', '/api/buildings', '/api/image'):
            return self.street(self.path.split('?')[0][5:], urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query))
        m = re.fullmatch(r'/private/tours/([A-Za-z0-9]{11})\.json', self.path.split('?')[0])
        if m and not os.path.exists(os.path.join(TOURS, m.group(1) + '.json')):  # a CoStar tour opened for the first time
            try:
                fetch_model(m.group(1))
            except ValueError as e:
                return self.reply(404, {'error': str(e)})
        super().do_GET()

    def do_POST(self):
        if self.path not in ('/api/agent', '/api/region', '/api/walk', '/api/ask', '/api/say'):
            return self.send_error(404)
        if OFFLINE:
            return self.reply(503, {'error': 'offline test server: Claude is off'})
        if not allowed(self):
            return self.reply(429, {'error': 'Too many questions at once. Try again in a few minutes.'})
        n = int(self.headers.get('Content-Length') or 0)
        if not 0 < n <= MAX_BODY:
            return self.reply(413, {'error': 'request too large'})
        try:
            body = json.loads(self.rfile.read(n))
            if self.path == '/api/agent':
                messages, apartment = body['messages'], body['apartment']
                assert isinstance(messages, list) and messages and isinstance(apartment, dict)
            elif self.path == '/api/walk':
                name, about, stops = str(body.get('name') or '')[:200], str(body.get('about') or '')[:300], body['stops']
                assert isinstance(stops, list) and 0 < len(stops) <= 60
                stops = [{k: str(s[k])[:400] for k in ('id', 'base', 'room', 'kind') if s.get(k) is not None} for s in stops]
                stops = [s for s in stops if s.get('id') and s.get('base')]  # a stop with no fact line is skipped, not the whole walk (it answered 400)
                assert stops
            elif self.path == '/api/say':
                heard, did, page = str(body['heard'])[:500], str(body['did'])[:1500], str(body.get('page') or '')[:60]
                history = [{'q': str(h['q'])[:500], 'a': str(h['a'])[:600]} for h in (body.get('history') or [])[-6:]]
                assert heard.strip() and did.strip()
            elif self.path == '/api/ask':
                prompt = ask_context(body)
            else:
                question, facts, rule, history = body['question'], body['facts'], body['rule'], body.get('history') or []
                assert isinstance(question, str) and 0 < len(question) <= 2000 and isinstance(rule, str)
                assert isinstance(facts, list) and facts and all(isinstance(f, dict) and isinstance(f.get('id'), str) for f in facts)
                assert isinstance(history, list) and all(isinstance(h, dict) and isinstance(h.get('q'), str) and isinstance(h.get('a'), str) for h in history)
        except Exception:
            return self.reply(400, {'error': 'bad request'})
        if self.path == '/api/ask':
            return self.reply(*street_ask(prompt))
        try:
            if self.path == '/api/region':
                return self.reply(200, region_script(question, facts, rule, history))
            if self.path == '/api/walk':
                return self.reply(200, walk_lines(name, about, stops))
            if self.path == '/api/say':
                return self.reply(200, say_line(heard, did, page, history))
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
            print(f'[{self.path}] Claude API error {e.status_code}: {str(e)[:300]}', file=sys.stderr)
            return self.reply(502, {'error': f'Claude API error {e.status_code}'})
        except anthropic.APIConnectionError:
            return self.reply(502, {'error': 'no connection to Claude'})
        except ScriptError as e:
            print(f'[{self.path}] {e}', file=sys.stderr)
            return self.reply(502, {'error': str(e)})
        out = r.model_dump(mode='json', exclude_none=True)
        self.reply(200, {'content': out['content'], 'stop_reason': r.stop_reason})

    def speak(self, text):
        """One sentence in Ethan's voice (mp3), streamed while Fish makes it, then kept on disk."""
        global _tts_used
        text = text.strip()[:600]
        if not FISH_KEY:
            return self.reply(404, {'error': 'no voice key'})
        if not text:
            return self.reply(400, {'error': 'no text'})
        path = os.path.join(TTS_DIR, hashlib.sha1(f'{VOICE_MODEL}|{VOICE_ID}|{text}'.encode()).hexdigest() + '.mp3')
        if os.path.exists(path):
            data = open(path, 'rb').read()
            self.send_response(200); self.send_header('Content-Type', 'audio/mpeg'); self.send_header('Content-Length', str(len(data))); self.end_headers()
            return self.wfile.write(data)
        if OFFLINE:
            return self.reply(404, {'error': 'offline: only saved lines play'})
        if not allowed(self):
            return self.reply(429, {'error': 'too many new lines at once'})
        with _tts_lock:
            if _tts_used + len(text.encode()) > TTS_CAP:
                return self.reply(429, {'error': 'voice budget for this run is used up'})
            _tts_used += len(text.encode())
        req = urllib.request.Request('https://api.fish.audio/v1/tts', json.dumps({'text': text, 'reference_id': VOICE_ID, 'format': 'mp3', 'mp3_bitrate': 128, 'latency': 'balanced', 'normalize': True}).encode(),
                                     {'Authorization': 'Bearer ' + FISH_KEY, 'Content-Type': 'application/json', 'model': VOICE_MODEL})
        try:
            up = urllib.request.urlopen(req, timeout=20)
        except Exception as e:
            print('[speak] Fish failed:', getattr(e, 'code', e), file=sys.stderr)
            return self.reply(502, {'error': 'the voice service did not answer'})
        self.send_response(200); self.send_header('Content-Type', 'audio/mpeg'); self.send_header('Cache-Control', 'no-store'); self.end_headers()
        chunks = []
        try:
            while b := up.read(8192):
                chunks.append(b); self.wfile.write(b); self.wfile.flush()
        except OSError:
            return  # the page cut it off (a new answer, or "stop"): only whole sentences are kept
        os.makedirs(TTS_DIR, exist_ok=True)
        with open(path + '.part', 'wb') as f:
            f.write(b''.join(chunks))
        os.replace(path + '.part', path)

    def street(self, kind, q):
        """GET /api/area, /api/buildings, /api/image: same checks and answers as the Next routes they replace."""
        num = lambda k, d=None: float(q[k][0]) if k in q else d  # ValueError on junk; nan and inf fail the range checks
        try:
            lat, lon = num('lat'), num('lon')
            ok = lat is not None and lon is not None and abs(lat) <= 90 and abs(lon) <= 180
            if kind == 'image':
                half, view, px = num('half', 250), q.get('view', ['ortho'])[0], float(q['px'][0]) if re.fullmatch(r'\s*[\d.]+\s*', q.get('px', [''])[0]) else 0
                px = int(min(4096, max(256, px if px and math.isfinite(px) else 1600)))  # 4096 for the 3D texture
                ok = ok and 20 <= half <= 500 and view in VEXCEL_VIEWS
        except ValueError:
            ok = False
        if not ok:
            return self.raw(400, ('bad lat, lon, half or view' if kind == 'image' else 'bad lat or lon').encode(), 'text/plain; charset=utf-8')
        try:
            if kind == 'image':
                return self.raw(200, *vexcel_image(lat, lon, half, view, px), 'private, max-age=3600')
            return self.raw(200, street_data(kind, lat, lon), 'application/json', 'no-store')
        except ValueError as e:
            return self.raw(502, str(e).encode(), 'text/plain; charset=utf-8')

    def raw(self, code, data, ctype, cache=None):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(data)))
        if cache:
            self.send_header('Cache-Control', cache)
        self.end_headers(); self.wfile.write(data)

    def reply(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    # The viewer bundle opens dozens of requests at once on a cold cache; the default listen queue of 5 resets some of them.
    http.server.ThreadingHTTPServer.request_queue_size = 128
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 8090))  # python tour/serve.py 8091 runs a second copy
    host = os.environ.get('HOST', '127.0.0.1')  # the container sets HOST=0.0.0.0
    http.server.ThreadingHTTPServer((host, port), functools.partial(Handler, directory=HERE)).serve_forever()
