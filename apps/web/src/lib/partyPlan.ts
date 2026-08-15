// Pre-designed Goal-Mode plan for party/hosting goals in the demo living room
// (scene_demo_room). The full pipeline result — agent steps, ranked options,
// validated checks, sourced products — is authored against the room's real
// object IDs and coordinates so the applied layout is dramatic and clean:
// seating and tables clear to the perimeter, the rug becomes the dance floor,
// and hive-sourced party gear (buffet table, speaker) is placed on apply.

export const matchPartyGoal = (text: string) =>
  /\b(party|parties|guests?|people over|ppl|birthday|host|hosting|celebrat|entertain)\b/i.test(text)

/** One inserted object on apply (rendered from the 3D library at real dims). */
export interface PartyAddition {
  name: string
  libraryKey: string
  category: string
  dims: [number, number, number]           // w, h, d meters
  pos: [number, number, number]
  product: {
    title: string; price_usd: number; url: string; retailer: string
    width_cm: number; height_cm: number; depth_cm: number
  }
}

// staged agent-run log; t = ms after start
export const PARTY_STEPS: { t: number; text: string }[] = [
  { t: 0, text: 'Parsing goal into a structured objective…' },
  { t: 700, text: 'Objective: Host ~20 guests tonight at 9:30 PM — clear a standing/dance area, keep drinks and seating reachable, protect walkways.' },
  { t: 1500, text: 'Analyzed 28 objects, 127 spatial relations; room ≈ 6.2 × 5.3 m; 9 movable' },
  { t: 2300, text: 'Constraint: standing capacity — 20 guests × 0.45 m² ⇒ need ≥ 9.0 m² clear floor (currently 4.6 m²)' },
  { t: 3100, text: 'Constraints: walkway ≥ 76 cm; keep clear: door, window bay, radiator' },
  { t: 3900, text: 'Generating candidate layouts (perimeter sweep + cluster packing)…' },
  { t: 4900, text: 'Validated candidates: 3 pass, 1 rejected (blocks window bay)' },
  { t: 5600, text: '🐝 Hive: sourcing party gear — buffet table, speaker, lighting (3 workers)' },
  { t: 7000, text: 'Fit-checked products against the cleared layout — all fit with clearance' },
  { t: 7700, text: 'Scored options: A=92, B=79, current=54' },
  { t: 8300, text: 'Recommendation ready' },
]

interface Check { label: string; passed: boolean; hard: boolean; detail: string; preexisting?: boolean }

const A_TRANSFORMS: Record<string, [number, number, number]> = {
  obj_0: [1.35, 0.47, 3.55],    // sofa group → right-back perimeter
  obj_13: [0.93, 0.63, 2.01],   // circle cushion rides with the sofa
  obj_1: [-1.60, 0.78, 3.35],   // steel-frame seating → left-back corner
  obj_5: [2.30, 0.23, 1.30],    // glass coffee table → right wall (drinks side)
  obj_10: [2.35, 0.53, 1.34],   // vases ride with the table
  obj_21: [2.02, 0.49, 1.27],   // apples ride with the table
  obj_23: [2.31, 0.45, 1.30],   // magazine rides with the table
  obj_15: [0.30, 0.03, 2.05],   // area rug → centered: the dance floor
  obj_3: [-2.05, 0.81, 0.90],   // floor lamp → front-left corner (ambient)
  obj_4: [-2.00, 0.26, 3.85],   // window cushions → floor seating, back-left
  obj_12: [2.45, 0.05, 3.70],   // marble side table → drinks station corner
}

const B_TRANSFORMS: Record<string, [number, number, number]> = {
  obj_0: [1.35, 0.47, 3.55],
  obj_13: [0.93, 0.63, 2.01],
  obj_5: [2.30, 0.23, 1.30],
  obj_10: [2.35, 0.53, 1.34],
  obj_21: [2.02, 0.49, 1.27],
  obj_23: [2.31, 0.45, 1.30],
}

export const PARTY_ADDITIONS: PartyAddition[] = [
  {
    name: 'Folding Buffet Table',
    libraryKey: 'desk', category: 'table',
    dims: [1.83, 0.74, 0.76],
    pos: [-0.55, 0.394, 0.78],   // along the window wall
    product: {
      title: 'Amazon Basics 6-Foot Folding Utility Table',
      price_usd: 64.99, url: 'https://www.amazon.com/dp/B071924VKD', retailer: 'Amazon',
      width_cm: 183, height_cm: 74, depth_cm: 76,
    },
  },
  {
    name: 'JBL PartyBox 110',
    libraryKey: 'speaker', category: 'electronics',
    dims: [0.30, 0.57, 0.30],
    pos: [-2.15, 0.31, 2.40],    // left wall, aimed at the dance floor
    product: {
      title: 'JBL PartyBox 110 Portable Party Speaker',
      price_usd: 349.95, url: 'https://www.amazon.com/dp/B08X4YMTPM', retailer: 'Amazon',
      width_cm: 30, height_cm: 57, depth_cm: 30,
    },
  },
]

const A_CHECKS: Check[] = [
  { label: 'Standing capacity ≥ 9.0 m²', passed: true, hard: true, detail: 'cleared floor ≈ 11.4 m² — comfortable for 20 standing guests' },
  { label: 'No collisions', passed: true, hard: true, detail: 'all clear after perimeter sweep' },
  { label: 'Inside room bounds', passed: true, hard: true, detail: 'all inside' },
  { label: 'Walkway ≥ 76 cm', passed: true, hard: false, detail: 'widest clear lane ≈ 96 cm (door → drinks station)' },
  { label: 'Door & window bay clear', passed: true, hard: true, detail: 'bay kept open as the buffet lane' },
  { label: 'Power for speaker', passed: true, hard: false, detail: 'outlet on left wall 0.8 m from speaker position' },
]

const B_CHECKS: Check[] = [
  { label: 'Standing capacity ≥ 9.0 m²', passed: false, hard: false, detail: 'cleared floor ≈ 8.2 m² — tight for 20; fine for ~15' },
  { label: 'No collisions', passed: true, hard: true, detail: 'all clear' },
  { label: 'Inside room bounds', passed: true, hard: true, detail: 'all inside' },
  { label: 'Walkway ≥ 76 cm', passed: true, hard: false, detail: 'widest clear lane ≈ 88 cm' },
]

const CUR_CHECKS: Check[] = [
  { label: 'Standing capacity ≥ 9.0 m²', passed: false, hard: true, detail: 'only ≈ 4.6 m² clear — fits ~10 standing, not 20' },
  { label: 'No collisions', passed: true, hard: true, detail: 'Leather Sofa ↔ Floor Lamp (pre-existing in capture, ignored)', preexisting: true },
  { label: 'Walkway ≥ 76 cm', passed: false, hard: false, detail: 'coffee table pinches the center lane to ≈ 52 cm' },
]

export function buildPartyResult(_goal: string) {
  return {
    objective: {
      objective_summary:
        'Host ~20 guests tonight at 9:30 PM: clear a central standing/dance area (≥ 9 m²), move seating and tables to the perimeter, stage drinks and music, keep walkways and the door clear.',
    },
    options: [
      {
        id: 'party-a', label: 'Option A — dance-floor layout', score: 92,
        note: 'Seating and tables sweep to the perimeter, the rug centers as the dance floor, drinks station in the back-right corner. Applies 11 moves and places the 2 hive-sourced items.',
        transforms: A_TRANSFORMS, checks: A_CHECKS,
        breakdown: { Fit: '20/20', Clearance: '18/20', Capacity: '20/20', Ergonomics: '18/20', Preference: '16/20' },
        additions: PARTY_ADDITIONS,
      },
      {
        id: 'party-b', label: 'Option B — conversation clusters', score: 79,
        note: 'Lighter touch: only the sofa and coffee table move. Two seating clusters stay intact — better for a mellow gathering, tight for 20.',
        transforms: B_TRANSFORMS, checks: B_CHECKS,
        breakdown: { Fit: '18/20', Clearance: '16/20', Capacity: '12/20', Ergonomics: '17/20', Preference: '16/20' },
      },
      {
        id: 'party-cur', label: 'Current layout', score: 54,
        note: 'Keep everything as-is. Fails the capacity constraint for 20 guests.',
        transforms: {}, checks: CUR_CHECKS,
        breakdown: { Fit: '15/20', Clearance: '10/20', Capacity: '5/20', Ergonomics: '12/20', Preference: '12/20' },
      },
    ],
    products: PARTY_ADDITIONS.map((a) => ({
      title: a.product.title, price_usd: a.product.price_usd, url: a.product.url,
      retailer: a.product.retailer, width_cm: a.product.width_cm,
      height_cm: a.product.height_cm, depth_cm: a.product.depth_cm,
      reviews_summary: a.name === 'JBL PartyBox 110'
        ? '4.7★ — built-in light show, 12 h battery; loud enough for a living-room dance floor.'
        : '4.6★ — folds flat for storage; seats a full drinks-and-snacks spread.',
      fit: { fits: true, clearance_cm: a.libraryKey === 'desk' ? 34 : 58, in_room: true, nearest: a.libraryKey === 'desk' ? 'window bay trim' : 'Steel Frames' },
    })).concat([{
      title: 'Twinkle Star 300 LED Window Curtain String Lights',
      price_usd: 19.99, url: 'https://www.amazon.com/dp/B01N7AXAWS', retailer: 'Amazon',
      width_cm: 300, height_cm: 300, depth_cm: 1,
      reviews_summary: '4.5★ — warm white, 8 modes; drapes over the bay window behind the buffet.',
      fit: { fits: true, clearance_cm: 0, in_room: true, nearest: 'window bay (wall-mounted)' },
    } as any]),
    recommendedId: 'party-a',
    rationale:
      'Option A is the only layout that clears the 9.0 m² standing requirement for 20 guests (11.4 m² after the perimeter sweep) while keeping a 96 cm lane from the door to the drinks station. The rug anchors the dance floor at room center, the buffet sits in the window bay out of the traffic path, and the speaker fires across the long axis from the left wall. Option B preserves both conversation clusters but caps comfortable capacity near 15.',
    analysis: { objects: 28, relations: 127, movable: 9, cleared_m2: 11.4 },
  }
}
