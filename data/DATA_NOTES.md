# Data for the accessibility planner

Prepared Wed 11 Nov 2026 in two rounds. Data only, no project code. Scope: wheelchair and limited mobility, products that need no construction.

| File | What |
|---|---|
| `products.json` | 84 real products, 35 types. Price, store, link, photo (saved file + store link), size (in and cm), the numbers that decide whether it fixes a problem, install method, which check it fixes |
| `matterport_spaces.json` | 38 public Matterport 3D tours (20 in Houston/LA, 5 labelled accessible/ADA, 6 senior living, homes, offices, clinics) as test spaces. Titles confirmed 13 Nov; free SDK key renders only the sample space (added 13 Nov) |
| `products.csv` | The same list as a table, for reading in Numbers |
| `photos/` | Store photos of all 84 products, named by product id (6.4 MB) |
| `rules.json` | 20 checks with the measurement, the ADA section, what the scan can and can't measure, and which product types fix each |
| `Rules_and_Stats_Sources.md` | The evidence: every rule and statistic with its quote and link |
| `profiles.json` | 6 disability profiles (manual wheelchair, power wheelchair, scooter, walker, cane, fall risk): how many, body and device numbers from research, what to ask, core and also checks; plus 3 groups not covered and why (added 12 Nov) |
| `evidence.json` | 15 ranked pitch claims with safe wording, numbers, sources and caveats (rank 1–5 = the headline set), plus 9 "don't say" lines (added 12 Nov) |
| `sources.json` | 46 sources with full citation, link, data year, design and status (`verified` = re-opened by Claude, `agent_full` / `agent_abstract` = agent only) (added 12 Nov) |

**Added 12 Nov from the academic research round:** every check in `rules.json` has a `research` block (what studies say, scan reliability high/medium/low/none, tape flag, sources) and `profiles_core` / `profiles_also`; `rules.json` has `verify_band_cm` (5 cm, a planning assumption until the tape test). Every product has `profiles` (Claude's assignment from the type's use) and, for 40 of them, an `evidence_note` (e.g. the tub-rail self-install failure). The plain-language version is `../notes/Accessibility_Brief.md`.

Round 2 research (rivals, barriers by room, scan limits, who pays, people to talk to) is in `../notes/research/Planner_Research_Nov11.md`, with the six full reports in `../notes/research/planner_nov11/`.

## How the products were collected
- Each product was read from its own store page on 11 Nov 2026. A value the page did not state is `null`; nothing was estimated.
- **Opened twice and matched: 29 of 84.** Round 1: rubber threshold ramp, HealthSmart hinges, Olide door opener, Moen 36 in grab bar, Carex seat riser, Drive transfer bench, IKEA crank desk, Stander pole, Able Life bed handle, Stander recliner risers, IKEA rug underlay. Round 2: 12 more of the original list (by a research agent) and 6 of the new ones (IKEA bed frame, Drive transfer board, ½ in Silver Spring ramp, HealthCraft pole, IKEA remote plug, Drive folding-back shower chair). The rest were read once.
- Three collected products were dropped in round 1: DormCo risers (price label unclear), a GE night light (seen only in a search result), a duplicate overbed table.
- **Round 2 added 29 products** for the gaps and thin types, and corrected six products from the maker's own page: Drive shower commode chair (seat 20–22 in), CouchCane (250 lb, not 300), Drive 18 in grab bar (250 lb), Moen flip-up bar (30 in long, 1¼ in diameter, 11½ in off the wall when up), Eagle bench (overall width not stated), Silver Spring 2 ft ramp (4 in rise confirmed). Each corrected product says so in its `notes`.
- `review: "check"` marks 24 products with a known doubt; `review_reason` says what. Look at these before one appears on a judge's screen.
- `tier` is the price rank inside a type (budget, mid, premium, or only). For threshold ramps and grab bars the products also differ by size, so pick by size first.
- `photo` is the saved file; `image_url` is the store's picture. All 84 have a saved photo, each looked at next to its product (55 saved on 11 Nov, 29 on 12 Nov). Two pairs share one store image: the Moen 36 in and 42 in grab bars, and the Silver Spring ½ in and ¾ in ramps. Sizes run from 310 px to 3000 px: 53 are 800 to 1000 px, and 7 are under 500 px (the smallest are the Drive 18 in grab bar at 310 px and three Moen grab bars at 380 px), which will look soft if shown large.
- Prices change. Re-open the demo products' pages on Saturday before recording.

## Gaps
- **No manufacturer stores.** Stander, Vive, Carex, Moen and the other Shopify-style stores refused automated reading, so prices come from Target, Discount Ramps, HealthyKin, F.W. Webb, IKEA, VEVOR and similar. F.W. Webb is a plumbing distributor: public price and an add-to-cart button, but ordinary-buyer checkout is not confirmed.
- **Still open doubts:** McKinney swing-clear hinge (per hinge or per pack, clearance gained); both Olide door openers (no page or manual says there is a plug: assume mains wiring); Golden hi-low bed (price per size); DMI transfer board (its only review says it did not ship).
- **Not found:** a third door opener, a rocker-switch extender, a consumer bed base whose height adjusts (the $1,599.90 entry is a hospital-style bed), a lever-tap aid, a tilt mirror.
- **Thin types (one product):** bath mat, cord cover, hand shower, switch extender, reacher, rug gripper, shower wheelchair, smart plug, remote plug, voice control. The budget slider has nothing to trade within these.
- **Vitality Medical "Rx only":** it is hidden boilerplate in the page code, not shown on the grab bar or the Eagle bench. Not tested at checkout.
- **Read from a page but not added:**
  - Eagle ERGO sliding transfer bench 78811, $123.00: https://www.vitalitymedical.com/sliding-ergo-transfer-bench-ergo.html
  - Delta 51900 hand shower on a 24 in grab-bar slide, $515.11: https://www.fwwebb.com/product/Delta/Universal-Showering-Components-Handshower-Set/51900/550712
  - Stander Wonder Pole with rotating grab bar, $229.99: https://www.target.com/p/stander-wonder-pole-tension-mounted-security-pole-with-rotating-grab-bar-bronze/-/A-1002280974

## What the scan cannot measure
The planner's honest limit, also noted per check in `rules.json`:
- **Door width:** the scan gives the opening, not the clear width with the door open. Subtract about 1.5 to 2 in, or ask. A scanned 32 in door is about 30 to 30.5 in clear, which fails. No source says whether RoomPlan's door width is the leaf, the frame or the opening, and no published study gives its error: the tape test is the only number.
- **Not seen at all:** sill and step height, door swing side, door handles, switches, closet rods, existing grab bars, rugs, cables.
- **Seen as a box only:** bed, sofa and toilet heights include the headboard, backrest or tank. Ask for the seat or mattress height. Boxes are snapped to nearby walls, so gaps beside a wall can be off.

## Which law
The ADA Standards do not apply to a private home. They are the reference measurements here. Newer apartment buildings (4+ units, first occupied after 13 March 1991) fall under the Fair Housing Act, which is looser inside the unit. Don't say "ADA compliant" in the pitch; say "meets the ADA reference width".

## Pitch numbers (sources in `Rules_and_Stats_Sources.md` and `../notes/research/planner_nov11/`)
- **5.5 million** US adults use a wheelchair; **18.4 million** use a cane, crutches or a walker (Census, 2014 data, published 2018). It is the newest Census count and it is 12 years old; say the year.
- **12.2%** of US adults have serious difficulty walking or climbing stairs (CDC, 2022 data).
- **0.15%** of US homes are wheelchair accessible; a third could be modified (HUD, 2011 housing survey, published 2015). No newer wheelchair figure exists; the 2019 survey's "40% aging-ready" uses a looser definition and can't be compared.
- **6.8 million** households have difficulty getting around or using their own home; entering the home is the most common difficulty, **4.2 million**; using the bathroom **3.3 million** (Harvard JCHS, 2019 data).
- **Widening one doorway: $600 to $2,000, average $1,200** (Angi's doorway pages, Oct 2026). Angi's accessible-home page (Sept 2026) prices the same job at $700 to $2,500 and a wheelchair remodel at about $4,400 (it prints both $4,378 and $4,367). Angi is a contractor marketplace, not a government source. Next to that: swing-clear hinges at $27.99.
- **Who pays:** the IRS counts ramps, wider doorways, grab bars and modified door hardware as medical expenses above 7.5% of income (Publication 502, 2025). Medicare's equipment list denies grab bars and raised toilet seats. In a private rental the tenant pays for the modification (HUD/DOJ, 2008).
- **Apartments.com today** (seen 11 Nov 2026, two Princeton listings): a "Wheelchair Access" filter and a "Wheelchair Accessible (Rooms)" tag. No door widths, no measurements.
- **Don't quote:** a price for an occupational-therapist home visit (no reliable source found), any home counts from page 7 of the JCHS paper (they contradict its own percentages), any home-modification market size, any Apartments.com listing count.

## Rules reminder
Collected data is allowed before Friday. Say in the README and on Devpost that the product list, photos and rule table were collected by hand before the event.
