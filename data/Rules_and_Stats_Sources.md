# Accessibility rules and pitch statistics: source check

Checked 11 Nov 2026. Status words: CONFIRMED, DIFFERENT, PARTLY, NOT FOUND.

**How the quotes were obtained (read this before putting a quote on a slide)**

- Part A (ADA Standards) and most HTML pages were read through a page-fetch tool that extracts text with a small model. I asked for character-for-character quotes and re-queried the key sections twice; the numbers agreed both times. Treat the wording as very likely exact, and open the section link once before printing any quote large on a slide.
- These I read directly as page images, so the wording is as printed: Census P70-152, CDC infographic PDF, JCHS 2022 paper, HUD/DOJ Joint Statement 2013, HUD "Accessibility of America's Housing Stock" (executive summary), HUD Fair Housing Act Design Manual pp. 3.3, 3.6, 3.7, 4.3.
- Apartments.com, Angi and Permobil were read in a live browser on 11 Nov 2026.
- Pages I could not open: ecfr.gov (blocked, used Cornell LII's copy of the CFR instead), several hud.gov pages (404), fairhousingfirst.org (not tried after HUD pages failed), nursing.jhu.edu CAPABLE (403), Invacare and Drive Medical product pages (gone / 404).

ADA Standards base URL: https://www.access-board.gov/ada/ (chapter pages: `/ada/chapter/ch03/`, `ch04/`, `ch06/`, `ch08/`, `ch09/`, `ch02/`; section anchors like `https://www.access-board.gov/ada/#ada-404`).

---

## Part A: 2010 ADA Standards

1. **Door clear width: CONFIRMED.** 32 in (815 mm) minimum, 404.2.3. "Door openings shall provide a clear width of 32 inches (815 mm) minimum." Measured "between the face of the door and the stop, with the door open 90 degrees." Conditions that change the number:
   - "Openings more than 24 inches (610 mm) deep shall provide a clear opening of 36 inches (915 mm) minimum."
   - No projections into the clear width below 34 in; between 34 and 80 in projections "shall not exceed 4 inches (100 mm)."
   - Exception 1: "In alterations, a projection of 5/8 inch (16 mm) maximum into the required clear width shall be permitted" (for the latch side stop).
   - URL: https://www.access-board.gov/ada/chapter/ch04/

2. **Route clear width: CONFIRMED, with one extra condition.** 403.5.1: "the clear width of walking surfaces shall be 36 inches (915 mm) minimum." Exception: "reduced to 32 inches (815 mm) minimum for a length of 24 inches (610 mm) maximum" but only "provided that reduced width segments are separated by segments that are 48 inches (1220 mm) long minimum and 36 inches (915 mm) wide minimum." Also 403.5.2: a 180-degree turn around an element less than 48 in wide needs 42 in approaching, 48 in at the turn, 42 in leaving (or 60 in at the turn). Same URL.

3. **Turning space: CONFIRMED.** 304.3.1: "The turning space shall be a space of 60 inches (1525 mm) diameter minimum. The space shall be permitted to include knee and toe clearance complying with 306." 304.3.2: "a T-shaped space within a 60 inch (1525 mm) square minimum with arms and base 36 inches (915 mm) wide minimum." T-shape knee/toe clearance is allowed "only at the end of either the base or one arm." 304.4: "Doors shall be permitted to swing into turning spaces." URL: https://www.access-board.gov/ada/chapter/ch03/

4. **Clear floor space: CONFIRMED.** 305.3: "The clear floor or ground space shall be 30 inches (760 mm) minimum by 48 inches (1220 mm) minimum." Condition: in an alcove it grows: 36 in wide for a forward approach if the alcove is deeper than 24 in (305.7.1); 60 in wide for a parallel approach if deeper than 15 in (305.7.2). Same URL.

5. **Thresholds: CONFIRMED.** 404.2.5: "Thresholds, if provided at doorways, shall be 1/2 inch (13 mm) high maximum." Exception: "Existing or altered thresholds 3/4 inch (19 mm) high maximum that have a beveled edge on each side with a slope not steeper than 1:2" are exempt. Thresholds must also meet 303 (so the part above 1/4 in must be beveled). URL ch04.

6. **Changes in level: CONFIRMED.** 303.2: "Changes in level of ¼ inch (6.4 mm) high maximum shall be permitted to be vertical." 303.3: "between ¼ inch (6.4 mm) high minimum and ½ inch (13 mm) high maximum shall be beveled with a slope not steeper than 1:2." 303.4: "Changes in level greater than ½ inch (13 mm) high shall be ramped." URL ch03.

7. **Ramp slope: CONFIRMED.** 405.2: "Ramp runs shall have a running slope not steeper than 1:12." Exception (existing sites only, and only "where such slopes are necessary due to space limitations"), Table 405.2:
   - steeper than 1:10 but not steeper than 1:8: maximum rise 3 inches (75 mm)
   - steeper than 1:12 but not steeper than 1:10: maximum rise 6 inches (150 mm)
   - footnote: "A slope steeper than 1:8 is prohibited."
   - Related: ramp clear width 36 in min (405.5); "The rise for any ramp run shall be 30 inches (760 mm) maximum" (405.6); landings 60 in long min (405.7.3). URL ch04.

8. **Reach ranges: CONFIRMED.** Unobstructed forward (308.2.1) and side (308.3.1): high 48 in max, low 15 in min. Obstructed values:
   - Forward over an obstruction (308.2.2): 48 in max if reach depth is 20 in or less; "Where the reach depth exceeds 20 inches (510 mm), the high forward reach shall be 44 inches (1120 mm) maximum"; reach depth 25 in max.
   - Side over an obstruction (308.3.2): obstruction 34 in high max and 24 in deep max; 48 in max if depth 10 in or less; "Where the reach depth exceeds 10 inches (255 mm), the high side reach shall be 46 inches (1170 mm) maximum."
   - Exception: tops of washers/dryers may be 36 in. URL ch03.

9. **Operable parts: CONFIRMED.** 309.4: "Operable parts shall be operable with one hand and shall not require tight grasping, pinching, or twisting of the wrist." "The force required to activate operable parts shall be 5 pounds (22.2 N) maximum." Note the text says "twisting of the wrist". URL ch03.

10. **Door hardware height: CONFIRMED.** 404.2.7: "Operable parts of such hardware shall be 34 inches (865 mm) minimum and 48 inches (1220 mm) maximum above the finish floor or ground." Hardware must also meet 309.4. I did not extract the exceptions to 404.2.7 (there are some for special gates and existing locks); check if needed. URL ch04.

11. **Door manoeuvring clearances, front approach: CONFIRMED, with a condition on the push side.** Table 404.2.4.1:
    - From front, pull side: 60 inches (1525 mm) perpendicular; 18 inches (455 mm) beyond the latch side.
    - From front, push side: 48 inches (1220 mm) perpendicular; 0 inches beside the latch, footnote: "Add 12 inches (305 mm) if closer and latch are provided."
    - Other rows (for reference): hinge side pull 60/36 or 54/42; hinge side push 42/22; latch side pull 48/24; latch side push 42/24 (several add 6 in with a closer). URL ch04.

12. **Knee and toe clearance: CONFIRMED, wording differs slightly.** Section 306 defines zones rather than saying "27 in minimum": toe clearance is the space from the floor to 9 in (306.2.1); knee clearance is "between 9 inches (230 mm) and 27 inches (685 mm) above the finish floor" (306.3.1). Widths: "Knee clearance shall be 30 inches (760 mm) wide minimum" (306.3.5); "Toe clearance shall be 30 inches (760 mm) wide minimum" (306.2.5). Depths (from the section summary, not quoted): toe 17 in min where required, 25 in max; knee 11 in deep min at 9 in high and 8 in deep min at 27 in high. URL ch03.

13. **Dining and work surfaces: CONFIRMED.** 902.3: "The tops of dining surfaces and work surfaces shall be 28 inches (710 mm) minimum and 34 inches (865 mm) maximum above the finish floor or ground." Needs a forward-approach clear floor space with knee/toe clearance (902.2). URL: https://www.access-board.gov/ada/chapter/ch09/

14. **Toilet: CONFIRMED, but homes get a different seat height.**
    - 604.4 seat height: "17 inches (430 mm) minimum and 19 inches (485 mm) maximum measured to the top of the seat." Exception 2: "In residential dwelling units, the height of water closets shall be permitted to be 15 inches (380 mm) minimum and 19 inches (485 mm) maximum."
    - 604.2 centreline: "16 inches (405 mm) minimum to 18 inches (455 mm) maximum from the side wall or partition."
    - 604.3.1 clearance: "60 inches (1525 mm) minimum measured perpendicular from the side wall and 56 inches (1420 mm) minimum measured perpendicular from the rear wall."
    - 604.3.2 residential exception: a lavatory may sit on the rear wall 18 in min from the toilet centreline if the clearance depth is 66 in min.
    - URL: https://www.access-board.gov/ada/chapter/ch06/

15. **Toilet grab bars: CONFIRMED, with two points to note.**
    - 604.5.1: "The side wall grab bar shall be 42 inches (1065 mm) long minimum, located 12 inches (305 mm) maximum from the rear wall" (and reaching 54 in min from the rear wall).
    - 604.5.2: "The rear wall grab bar shall be 36 inches (915 mm) long minimum" (12 in one side of centreline, 24 in the other; 24 in long allowed where space is tight).
    - 609.4: "33 inches (840 mm) minimum and 36 inches (915 mm) maximum above the finish floor measured to the top of the gripping surface."
    - 609.2.1: "outside diameter of 1¼ inches (32 mm) minimum and 2 inches (51 mm) maximum."
    - 609.3: "The space between the wall and the grab bar shall be 1½ inches (38 mm)." This is an exact value, not a minimum. 12 in clear above the bar, 1½ in below and at ends.
    - 609.8: "a vertical or horizontal force of 250 pounds (1112 N) is applied at any point on the grab bar, fastener, mounting device, or supporting structure."
    - Home-relevant exception to 604.5: "In residential dwelling units, grab bars shall not be required to be installed in toilet or bathrooms provided that reinforcement has been installed in walls."

16. **Lavatory / sink: CONFIRMED.** 606.3: "the front of the higher of the rim or counter surface 34 inches (865 mm) maximum above the finish floor or ground." Exception 2 (residential kitchens): adjustable sinks "29 inches (735 mm) minimum and 36 inches (915 mm) maximum" allowed. Related: 804.3.2 kitchen work surface 34 in max. URL ch06 / ch08.

17. **Bathtub and shower: CONFIRMED, one nuance.**
    - 610.2 bathtub seat: "The top of bathtub seats shall be 17 inches (430 mm) minimum and 19 inches (485 mm) maximum above the bathroom finish floor."
    - 610.3 shower seat: "The top of the seat shall be 17 inches (430 mm) minimum and 19 inches (485 mm) maximum above the bathroom finish floor."
    - 608.2.1 transfer shower: "36 inches (915 mm) by 36 inches (915 mm) clear inside dimensions" with a 36 in wide min entry. Nuance: 36 x 36 is stated as an exact size, not a minimum. Needs a 36 x 48 in clearance beside it.
    - 608.2.2 standard roll-in: "30 inches (760 mm) wide minimum by 60 inches (1525 mm) deep minimum" with a 60 in wide min entry.
    - 608.2.3 alternate roll-in: 36 in wide and 60 in deep min, 36 in entry.
    - 607.2: clearance in front of a bathtub is the tub length by 30 in wide min. URL ch06.

18. **Beds: bed height NOT FOUND in the standard (your belief holds); bedside clearance is DIFFERENT from what you listed.**
    - No bed or mattress height appears anywhere in Chapter 8. The only height reference is Advisory 803.1 (benches): "at the same height as a typical wheelchair seat, 17 inches (430 mm) to 19 inches (485 mm)."
    - 806.2.3 (transient lodging guest rooms) requires both sides, not one: "At least one sleeping area shall provide a clear floor space complying with 305 on both sides of a bed." "The clear floor space shall be positioned for parallel approach to the side of the bed." Exception: one 30 x 48 space between two beds is enough.
    - Section 809 (residential dwelling units) does not mention beds at all. What it does require: accessible route in the unit (809.2), and 809.2.2: "All rooms served by an accessible route shall provide a turning space complying with 304"; kitchen per 804; toilet/bathing fixtures per 603 to 610.
    - Other bed clauses: 805.3 medical patient bedrooms, "on each side of the bed"; 807.2.3 cells, "on at least one side of the bed."
    - URL: https://www.access-board.gov/ada/chapter/ch08/

19. **Closet rods / shelves / storage: PARTLY.** There is no "closet rod 48 in" sentence. 811.3 says only: "Storage elements shall comply with at least one of the reach ranges specified in 308." So 48 in max (15 in min) holds only for an unobstructed reach; it drops to 46 in (side reach over an obstruction 10 to 24 in deep) or 44 in (forward reach over 20 to 25 in). Clothes rods are named as storage in Advisory 225.2: "closets, cabinets, shelves, clothes rods, hooks, and drawers." Scoping is "at least one of each type" (225.2). Shelves in toilet rooms and dressing rooms: "40 inches (1015 mm) minimum and 48 inches (1220 mm) maximum" (603.4, 803.5). URLs ch08, ch02.

20. **Mirrors: CONFIRMED.** 603.3: "Mirrors located above lavatories or countertops shall be installed with the bottom edge of the reflecting surface 40 inches (1015 mm) maximum above the finish floor." Other mirrors: "35 inches (890 mm) maximum." URL ch06.

---

## Part B: which law applies to private homes

- **Do the ADA Standards apply to a private apartment or house? No, with exceptions: CONFIRMED.** DOJ ADA Title III Technical Assistance Manual, III-1.2000: "Although title III does not apply to strictly residential facilities, it covers places of public accommodation" inside them (e.g. a rental office). III-1.3100: "Commercial facilities do not include rail vehicles or any facility covered by the Fair Housing Act." URL: https://archive.ada.gov/taman3.html
  - The Standards do cover some housing: Advisory 233.1 says section 233 covers "residential facilities subject to the Americans with Disabilities Act of 1990" (housing provided by public entities, e.g. public housing, state university housing); there, "at least 5 percent, but no fewer than one unit" need mobility features (233.3.1.1). URL: https://www.access-board.gov/ada/chapter/ch02/
  - HUD/DOJ Joint Statement Q4: "Detached single family houses as well as duplexes and triplexes are not covered by the Act's design and construction requirements." So a private single-family house is under neither law's design rules (state/local codes may differ).
- **What applies to US multifamily housing: CONFIRMED.** Fair Housing Act, 42 U.S.C. 3604(f)(3)(C); HUD regulation 24 CFR 100.205.
  - Coverage, 24 CFR 100.201: "Covered multifamily dwellings means buildings consisting of 4 or more dwelling units if such buildings have one or more elevators; and ground floor dwelling units in other buildings consisting of 4 or more dwelling units." URL (Cornell LII copy; ecfr.gov blocked the tool): https://www.law.cornell.edu/cfr/text/24/100.201
  - Date: HUD/DOJ Joint Statement (30 Apr 2013) Q2: "designed and constructed for first occupancy after March 13, 1991." Q4: "buildings having four or more dwelling units built for first occupancy after March 13, 1991." URL: https://www.justice.gov/crt/about/hce/documents/jointstatement_accessibility_4-30-13.pdf (Note: search results show HUD later rescinded the Joint Statement's statute-of-limitations position; that does not touch coverage. Not checked further.)
  - Seven requirements (Joint Statement p. 3): 1 accessible building entrance on an accessible route; 2 accessible public and common use areas; 3 usable doors; 4 accessible route into and through the unit; 5 switches, outlets, thermostats in accessible locations; 6 reinforced walls for grab bars; 7 usable kitchens and bathrooms.
  - Safe harbours, 24 CFR 100.205(e): ANSI A117.1-1986, CABO/ANSI A117.1-1992, ICC/ANSI A117.1-1998, ICC/ANSI A117.1-2003, ICC A117.1-2009; the "Fair Housing Accessibility Guidelines, March 6, 1991"; the "Fair Housing Act Design Manual". URL: https://www.law.cornell.edu/cfr/text/24/100.205
- **FHA numbers that differ from ADA: CONFIRMED (Design Manual read directly; Guidelines text via a reproduction).**
  - Doors inside the unit ("usable doors"): Guidelines Requirement 3, "a clear opening of at least 32 inches nominal width when the door is open 90 degrees"; "A 34-inch door, hung in the standard manner, provides an acceptable nominal 32-inch clear opening." (HUD Guidelines as reproduced at https://corada.com/documents/24-cfr-100-fhag/requirement-3-usable-doors)
  - Design Manual p. 3.6: a 34-inch door gives "an 'acceptable' nominal 32-inch clear opening of at least 31-5/8 inches clear." p. 3.7: builders "may not install a 32-inch wide door (which effectively yields a 30 to 30-1/2 inch opening)." URL: https://www.huduser.gov/publications/pdf/fairhousing/fairch3.pdf
  - Design Manual p. 3.3: interior unit doors "are not required to meet the ANSI 4.13 Doors requirements for maneuvering clearances, hardware, and opening force." Public/common-area doors and the outside of the unit entry door must meet ANSI 4.13 (full 32 in clear).
  - Route inside the unit: Design Manual p. 4.3 figure title, "36-Inch Wide Minimum Accessible Route Through Dwelling Unit"; it may narrow to 32 in nominal at doors. URL: https://www.huduser.gov/publications/pdf/fairhousing/fairch4.pdf
  - Grab bars: FHA requires only wall reinforcement, not the bars.
  - NOT FOUND: I did not open ANSI A117.1 itself (paid standard) or fairhousingfirst.org.

---

## Part C: product-related facts

1. **Swing-clear / offset hinges: CONFIRMED by a government source (about 2 in); manufacturer gives no number.**
   - HUD Fair Housing Act Design Manual p. 3.6, figure note: "installation of swing-clear hinges is a modification that increases a 32" doorway opening to approximately 34"." p. 3.7: "swing-clear hinges allow a door to swing completely out of the doorway and increase the clear opening." URL: https://www.huduser.gov/publications/pdf/fairhousing/fairch3.pdf
   - Manufacturer (Ives / Allegion, 5BB1SC): "Designed to completely clear the opening when door is opened 92°." No inch figure stated. URL: https://www.iveshardware.com/en/products/architectural-hinges/five-knuckle-swing-clear-full-mortise-hinges.html
   - So the gain is roughly the door thickness (1-3/8 to 1-3/4 in for house doors); "up to 2 inches" is fair, "always 2 inches" is not. The thickness reasoning is mine, not a quote.

2. **Wheelchair overall width: PARTLY.**
   - Research source: Anthropometry of Wheeled Mobility Project, Final Report (IDeA Center, Univ. at Buffalo, for the U.S. Access Board, Dec 2010), s. 3.3.1: "our results for mean unoccupied width are just under the U.S. standard reference wheelchair of 660 mm (26 in.)." This is all device types pooled; the per-type means are in figures I could not read. s. 3.3.3: "10‒20% of individuals measured in our study have an occupied width that is greater than the U.S. standard of 760 mm (30 in.)" (about 10% of manual, 20% of power users). Read via a reproduction: https://corada.com/documents/anthropometry-of-WhM-project/3-3 (original PDF at idea.ap.buffalo.edu was too large for the tool).
   - Power chair, manufacturer page (Permobil M3 Corpus, US site, read live): "Base Width 24", "Base Length 35.5", "Minimum Turning Radius 20.5''". Base width only; seat and armrests can be wider (seat width 17 to 23 in). URL: https://www.permobil.com/en-us/products/power-wheelchairs/permobil-m3-corpus
   - Manual chair, manufacturer spec: NOT FOUND on a manufacturer page (Invacare and Drive Medical pages would not open). Retailer listings seen only in search snippets put an 18 in seat chair at about 26 to 26.5 in overall; unverified.
   - The 2010 ADA Standards themselves give no wheelchair width; they give the 30 x 48 in clear floor space (305.3).

3. **Wheelchair seat height and bed height: PARTLY (seat height sourced; bed height is guidance only, not law).**
   - Access Board text: Advisory 803.1, "a typical wheelchair seat, 17 inches (430 mm) to 19 inches (485 mm)." URL: https://www.access-board.gov/ada/chapter/ch08/
   - Measured data say higher: "Analysis of Low Wheelchair Seat Heights and Transfer Surfaces for Medical Diagnostic Equipment" (C. D'Souza, for the U.S. Access Board, 28 Jan 2022), Table 2, occupied seat height: manual chairs mean 19.5 in (SD 1.5, median 19.4, range 16.3 to 23.9, n = 277); powered chairs mean 21.2 in (SD 2.0, range 16.2 to 28.9, n = 189). "a seat height of 17 in. corresponded to the 4.5 percentile"; 19 in was the 42nd percentile. URL: https://www.access-board.gov/research/human/wheelchair-seat-height/
   - Manufacturer example: Permobil M3 Corpus "Seat To Floor Height 17.5", 18.5", 19.5"" (without cushion).
   - Bed height, law: none. DOJ's 2010 advance notice only asked the question ("What are appropriate bed heights to ensure accessibility by individuals with mobility disabilities") and the page marks that rulemaking as withdrawn. URL: https://archive.ada.gov/anprm2010/equipment_anprm_2010.htm
   - Bed height, guidance (not law): ADA National Network factsheet "Accessible Lodging" (Mid-Atlantic ADA Center, 2017): "recommended bed height is between 20 to 23 inches from the floor to top of the mattress." URL: https://adata.org/factsheet/lodging/
   - Bed height, second guidance (not law): Great Plains ADA Center, "ADA For Lodging: Best Practices", as reproduced by Corada: "no higher than 23" and no lower than 17" above the floor surface", measured "from the floor to the top of an uncompressed mattress"; it says bed heights "are not specified in the 2010 Standards." URL: https://www.corada.com/documents/ada-lodging-best-practices-and-standards/bed-height-fact-sheet
   - NOT FOUND: a United Spinal or rehab-hospital number; I did not open one.

---

## Part D: pitch statistics

1. **Wheelchair users and mobility disability: CONFIRMED.**
   - 5.5 million US adults used a wheelchair. Data year 2014 (SIPP, SSA Supplement). U.S. Census Bureau, "Americans With Disabilities: 2014", P70-152, D. Taylor, Nov 2018, p. 8: "7.7 percent (18.4 million) of all adults used a cane, crutches, or a walker to assist with mobility and 2.3 percent (5.5 million) used a wheelchair." URL: https://www.census.gov/content/dam/Census/library/publications/2018/demo/p70-152.pdf (This is the newest Census wheelchair count I could open; it is 12 years old.)
   - 12.2% of US adults have a mobility disability. CDC infographic "Disability Impacts All of Us": "MOBILITY ... Serious difficulty walking or climbing stairs", 12.2%; "More than 1 in 4 adults in the United States have some type of disability (28.7%)". Source cited is CDC's DHDS (updated July 2024); CDC's DHDS page ties the 28.7% to "2022 Behavioral Risk Factor Surveillance System (BRFSS) data", so the data year is 2022 (the infographic itself prints no year). URLs: https://www.cdc.gov/disability-and-health/articles-documents/disability-impacts-all-of-us-infographic.html and https://www.cdc.gov/disability-and-health/articles-documents/disability-and-health-data-now.html
   - CDC gives a percentage, not a headcount. Any "about 30 million adults" figure would be our own arithmetic.

2. **Share of homes that are accessible: CONFIRMED (classic) and PARTLY (newest uses a looser definition).**
   - Classic, data year 2011 (American Housing Survey). HUD PD&R, "Accessibility of America's Housing Stock: Analysis of the 2011 American Housing Survey", Bo'sher, Chan, Ellen, Karfunkel, Liao, March 2015, executive summary: "almost one third of housing is potentially modifiable, but we estimate that just 0.15% of housing is currently wheelchair accessible." Table: Level 1 potentially modifiable 33.3% of all housing units; Level 2 livable for moderate mobility difficulties 3.8%; Level 3 wheelchair accessible 0.15%. URL: https://www.huduser.gov/portal/sites/default/files/pdf/accessibility-america-housingStock.pdf
   - Harvard JCHS on the same 2011 data (quoted in its March 2022 paper, p. 3): "less than 4 percent of US homes offered a combination of a no-step entry into the home, single-floor living, and wide halls and doors."
   - Newest, data year 2019 (AHS). U.S. Census Bureau, "Aging-Ready Homes in the United States", P23-219, 10 Oct 2023 (tip sheet CB23-TPS.101): "About 50 million or 40% of U.S. homes had what were considered to be the most basic, aging-ready features", i.e. "a step-free entryway into the home and a bedroom and full bathroom on the first floor." URL: https://www.census.gov/newsroom/press-releases/2023/aging-ready-homes.html
   - Caution: the 2019 survey did not ask about door widths or wheelchair features, so 40% is not "wheelchair accessible" and must not be set against 0.15% as a trend. There is no newer wheelchair-accessible share than the 2011 one.

3. **Cost of a home accessibility modification: PARTLY (contractor-marketplace data, not a government source); OT assessment cost NOT FOUND.**
   - Angi, "How Much Does It Cost to Make My Home Wheelchair Accessible? [2026 Data]", T. Moore, updated 16 Sep 2026: "Your wheelchair accessibility remodel ranges from $125 to $19,675, with an average cost of $4,378." Also "Widening a doorway: $700–$2,500"; "Widening hallways: $30,000–$40,000"; full remodel "$18,000 to $75,000". URL: https://www.angi.com/articles/how-much-does-it-cost-make-my-home-handicap-accessible.htm
   - Occupational-therapist home assessment: no authoritative US price found. Search snippets only showed a low-authority directory ("$150 – $500") and single providers. The Johns Hopkins CAPABLE page would not open. Do not cite a number.

4. **People living in homes that don't meet their needs: CONFIRMED.**
   - 6.8 million US households, data year 2019 (AHS). Harvard JCHS, "How Well Does the Housing Stock Meet Accessibility Needs? An Analysis of the 2019 American Housing Survey", Scheckler, Molinsky, Airgood-Obrycki, March 2022, p. 6: "About 5 percent of households reported that they experienced difficulty navigating or using their homes, amounting to a total of 6.8 million households." URL: https://jchs.harvard.edu/sites/default/files/research/files/harvard_jchs_housing_stock_accessibility_scheckler_2022_0.pdf
   - Same paper, p. 1: "Less than half of adults who rely on a mobility aid such as a wheelchair or walker live in a home that has both a no-step entry or ramp and a bedroom and bathroom on the main level."
   - Census (2019 AHS, published 10 Oct 2023): "About 4 million or 11% of older households reported difficulty living in or using their home."
   - Caution: on p. 7 the JCHS paper prints home counts that do not match its own percentages ("5.2 million homes (42 percent)"). Use its percentages and the 6.8 million households figure, not those home counts.

5. **How Apartments.com shows wheelchair access (seen live, 11 Nov 2026): CONFIRMED, a tag with no measurements.**
   - Search page https://www.apartments.com/princeton-nj/wheelchair-accessible/ is headed "Apartments for Rent in Princeton NJ with Wheelchair Access" (49 rentals). Under "All Filters" there is an amenity filter button labelled "Wheelchair Access". Result cards list it as one amenity among others: "Wheelchair Access, Fitness Center, Pool, Dishwasher, Refrigerator, Kitchen".
   - The page's own description: "An ADA-compliant apartment may provide you with reasonable accommodations such as wide doorways, wheelchair-accessible showers, and lower electrical sockets and light switches."
   - Listing 1, Barclay Square at Princeton Forrestal: the only accessibility item in the page text is the feature tag "Wheelchair Accessible (Rooms)". No door widths, no dimensions, no ramp/roll-in shower/grab bar text.
   - Listing 2, Copperwood in Princeton: again "Wheelchair Accessible (Rooms)" plus "Elevator" as a community amenity. No measurements.
   - Scope: two listings in one town; I searched each page's text for wheelchair, accessible, ADA, doorway, inches, roll-in, grab bar, ramp. Floor-plan images were not inspected.
