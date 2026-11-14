# Pulls the wall graph + doors + rooms for the demo tours into tour/private/tours/ (CoStar Sponsor Data: git-ignored, local only, delete by Sun Nov 15 4 PM).
import json, base64, urllib.request, time, os
HERE = os.path.dirname(os.path.abspath(__file__))
env = dict(l.strip().split('=', 1) for l in open(os.path.join(HERE, '..', '.env.local')) if '=' in l and not l.startswith('#'))
key, token = (env[k].strip().strip('"') for k in ('MATTERPORT_API_KEY', 'MATTERPORT_API_TOKEN'))
auth = base64.b64encode(f"{key}:{token}".encode()).decode()
Q = """query($id: ID!){ model(id:$id){ id name
  floors { id label vertices { id position { x y } }
           edges { id type thickness vertices { id } openings { type width height lowerElevation relativeCenter } } }
  rooms { id floor { id } classifications { label } boundary { edges { id } } dimensions(units: metric){ areaFloor width depth height } } } }"""
TOURS = ["7SAPy5naNTU", "WujDsf7FeDh", "jgT5sEp5tAS", "uTsQJ3rMHD2", "Y8pWKRMMq8q"]
index = []
for sid in TOURS:
    req = urllib.request.Request('https://api.matterport.com/api/models/graph', json.dumps({'query': Q, 'variables': {'id': sid}}).encode(),
                                 {'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json'})
    m = json.load(urllib.request.urlopen(req, timeout=60))['data']['model']
    json.dump(m, open(f'{HERE}/private/tours/{sid}.json', 'w'))
    index.append({'id': sid, 'name': m['name']})
    print(sid, m['name'], len(m['floors']), 'floor(s)')
    time.sleep(0.3)
json.dump(index, open(f'{HERE}/private/tours/index.json', 'w'), indent=1)
