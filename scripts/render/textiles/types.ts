// Design vocabulary for the procedural textile renders (saris and blouses).
// Shared by the catalogue (scripts/render/catalog.ts) and the canvas renderer.

/** How the cloth is woven: drives grain, sheen and translucency. */
export type Weave =
  | 'silk' // Kanjivaram-weight mulberry silk: heavy, strong sheen
  | 'soft-silk'
  | 'katan' // Banarasi katan: dense, lustrous
  | 'tanchoi' // satin-faced silk
  | 'chanderi' // silk-cotton, light and slightly sheer
  | 'maheshwari'
  | 'cotton'
  | 'linen'
  | 'kota' // kota doria: open square-check weave
  | 'organza'
  | 'tissue'; // zari woven into the weft: metallic

/** The all-over pattern of the sari body (or blouse fabric). */
export type FieldMotif =
  | 'plain'
  | 'coin-butta' // kasu (coin) buttas in a half-drop grid
  | 'flower-butta'
  | 'paisley-butta'
  | 'dot-butta'
  | 'star-butta'
  | 'jaal' // diamond lattice with small flowers at the joins
  | 'jangla' // Banarasi jangla: large lattice of leaves and paisleys
  | 'tanchoi' // dense tone-on-tone small motifs
  | 'checks'
  | 'kota-checks'
  | 'stripes'
  | 'brocade' // dense zari brocade (blouse fabric)
  | 'embroidered-florals'; // scattered thread-embroidered sprigs (organza)

export type BorderStyle =
  | 'temple' // korvai contrast border with temple (gopuram) teeth
  | 'rudraksha'
  | 'paisley-band'
  | 'vine'
  | 'stripes' // several zari stripes (Chanderi, Maheshwari)
  | 'thin' // a narrow zari edge (kasavu, linen)
  | 'tope-teni' // Ilkal: band with interlocking teeth
  | 'scallop'; // embroidered scalloped edge (organza)

export type PalluStyle = 'bands' | 'paisley-field' | 'grand' | 'tope-teni' | 'stripes' | 'plain-zari';

export interface SariDesign {
  weave: Weave;
  field: FieldMotif;
  /** Motif spacing relative to the sari width (default 0.12). */
  motifScale?: number;
  border: BorderStyle;
  /** Border width relative to the sari width (0.04–0.22). */
  borderWidth: number;
  pallu: PalluStyle;
}

/** Colours of one sari colourway. `zari` is the metallic thread colour. */
export interface SariColors {
  body: string;
  /** Motif colour when the field motifs are woven in thread rather than zari. */
  motif?: string;
  border: string;
  pallu: string;
  zari: string;
  /** Second accent used in borders, stripes and the pallu. */
  accent?: string;
}

export type Neckline = 'round' | 'sweetheart' | 'v' | 'boat' | 'high';
export type Sleeve = 'sleeveless' | 'short' | 'elbow' | 'three-quarter';
export type BackStyle = 'round' | 'deep-u' | 'keyhole' | 'deep-v';
export type Embroidery = 'none' | 'mirror' | 'zardozi' | 'thread';

export interface BlouseDesign {
  weave: Weave;
  field: FieldMotif;
  motifScale?: number;
  neck: Neckline;
  sleeve: Sleeve;
  back: BackStyle;
  /** Band along the sleeve hems and neckline. */
  trim: 'none' | 'zari' | 'piping';
  embroidery: Embroidery;
  /** Tasselled tie (dori) at the back. */
  dori: boolean;
}

export interface BlouseColors {
  body: string;
  motif?: string;
  trim: string;
  zari: string;
  accent?: string;
}

export type SariView = 'fold' | 'drape' | 'detail';
export type BlouseView = 'front' | 'back' | 'detail';
