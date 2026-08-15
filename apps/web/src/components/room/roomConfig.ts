// Semantic grouping for the demo room GLB (McGuire archive "living room",
// © Wig42, CC-BY 3.0 — see THIRD_PARTY_NOTICES). Meshes are grouped by
// material name into selectable real-world objects; the rest is the room
// shell (walls/floor/lights) and stays static.

export interface GroupDef {
  label: string
  category: string
}

// material name -> selectable group
export const MATERIAL_GROUPS: Record<string, GroupDef> = {
  SofaLeather: { label: 'Leather Sofa', category: 'seating' },
  Cushion: { label: 'Circle-pattern Cushion', category: 'textile' },
  Cushion1: { label: 'Striped Cushions', category: 'textile' },
  Cushion3: { label: 'Purple Cushion', category: 'textile' },
  Carpet: { label: 'Area Rug', category: 'textile' },
  TableGlossy: { label: 'Glass Coffee Table', category: 'table' },
  TvScreen: { label: 'TV', category: 'electronics' },
  TvBevel: { label: 'TV', category: 'electronics' },
  Books: { label: 'Books', category: 'decor' },
  Magazine: { label: 'Magazine', category: 'decor' },
  Apple: { label: 'Apples', category: 'decor' },
  Ceramic: { label: 'Ceramic Vases', category: 'decor' },
  CandleHolders: { label: 'Candle Holders', category: 'decor' },
  LampStand: { label: 'Floor Lamp', category: 'lighting' },
  LampshaderOuter: { label: 'Floor Lamp', category: 'lighting' },
  CeilingLampshade: { label: 'Ceiling Lamp', category: 'lighting' },
  LargePicture: { label: 'Large Wall Print', category: 'decor' },
  SmallPictureFrame: { label: 'Small Picture Frames', category: 'decor' },
  Picture: { label: 'Wall Picture A', category: 'decor' },
  Picture1: { label: 'Wall Picture B', category: 'decor' },
  Picture2: { label: 'Wall Picture C', category: 'decor' },
  Picture4: { label: 'Wall Picture D', category: 'decor' },
  Picture5: { label: 'Wall Picture E', category: 'decor' },
  LoveLettersBack: { label: 'Love Letters Print', category: 'decor' },
  RadioPlastic: { label: 'Vintage Radio', category: 'electronics' },
  RadioSurround: { label: 'Vintage Radio', category: 'electronics' },
  RadioInside: { label: 'Vintage Radio', category: 'electronics' },
  RadiatorPanelsEnamel: { label: 'Radiator', category: 'object' },
  RadiatorKnobOuter: { label: 'Radiator', category: 'object' },
  BlindMaterial: { label: 'Roller Blinds', category: 'textile' },
  BlackMarble: { label: 'Marble Side Table', category: 'table' },
  BlackWroughtIron: { label: 'Wrought-iron Stand', category: 'object' },
  DullSteel: { label: 'Steel Frames', category: 'object' },
}

// materials that stay static (room shell + light fixtures)
export const STATIC_MATERIALS = new Set([
  'Walls', 'Floor', 'Trim', 'WhitePaint', 'Default',
  'BackLight', 'LeftLight', 'MiddleLight', 'RightLight',
])

export const DEMO_SCENE_ID = 'scene_demo_room'
