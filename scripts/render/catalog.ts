// Sample catalogue for development and demos: original saris and blouses whose
// photographs are rendered procedurally (scripts/render/textiles). They are
// placeholders for the store's real stock; product copy describes the design
// and construction only, with no certification or provenance claims beyond
// the weave tradition each design follows.

import type { BlouseColors, BlouseDesign, BlouseView, SariColors, SariDesign, SariView } from './textiles/types';

export type ColorFamily =
  | 'black' | 'white' | 'grey' | 'beige' | 'brown' | 'blue' | 'green' | 'red' | 'pink' | 'purple' | 'yellow' | 'orange' | 'multi';

interface BaseProduct {
  slug: string;
  name: string;
  sku: string;
  category: string; // leaf category slug
  gender: 'men' | 'women' | 'kids' | 'unisex';
  price: number; // rupees (MRP)
  salePrice?: number; // rupees
  short: string;
  description: string;
  attributes: [string, string][];
  tags: string[];
  flags: { featured?: boolean; new?: boolean; bestseller?: boolean; trending?: boolean };
  /** Name of the variant option shown to shoppers, e.g. "Size". */
  variantLabel: string;
  /** Option values; a single 'Standard' value means the product has no options. */
  sizes: string[];
  stock: number[][]; // [colorway][option]
  collections: string[];
}

export interface SariColorway {
  name: string;
  family: ColorFamily;
  /** Swatch colour shown to shoppers. */
  hex: string;
  colors: SariColors;
}

export interface BlouseColorway {
  name: string;
  family: ColorFamily;
  hex: string;
  colors: BlouseColors;
}

export interface SariProduct extends BaseProduct {
  kind: 'sari';
  design: SariDesign;
  colorways: SariColorway[];
}

export interface BlouseProduct extends BaseProduct {
  kind: 'blouse';
  design: BlouseDesign;
  colorways: BlouseColorway[];
}

export type SampleProduct = SariProduct | BlouseProduct;

const STD = ['Standard'];
const BUST = ['32', '34', '36', '38', '40', '42'];

export interface SampleCategory {
  slug: string;
  name: string;
  description: string;
  /** Parent category slug (two levels at most). */
  parent?: string;
  /** Size guide shown on product pages in this category (see the rebrand migration). */
  sizeGuide?: 'blouse';
}

// Top-level departments first, then their sub-categories.
export const CATEGORIES: SampleCategory[] = [
  { slug: 'saris', name: 'Saris', description: 'Handwoven silks and cottons from the weaving towns of India.' },
  { slug: 'blouses', name: 'Blouses', description: 'Ready-to-wear blouses cut to pair with our saris.', sizeGuide: 'blouse' },

  { slug: 'kanjivaram', name: 'Kanjivaram', description: 'Heavy mulberry silk from Kanchipuram, with contrast borders woven in korvai.', parent: 'saris' },
  { slug: 'banarasi', name: 'Banarasi', description: 'Katan and tanchoi silks from Varanasi, brocaded with zari.', parent: 'saris' },
  { slug: 'chanderi-maheshwari', name: 'Chanderi & Maheshwari', description: 'Light silk-cottons from Madhya Pradesh, with fine zari borders.', parent: 'saris' },
  { slug: 'cotton-linen', name: 'Cotton & Linen', description: 'Everyday handloom in cotton, linen and kota doria.', parent: 'saris' },
  { slug: 'organza-tissue', name: 'Organza & Tissue', description: 'Sheer organzas and zari tissues for evenings and ceremonies.', parent: 'saris' },

  { slug: 'classic-blouses', name: 'Classic', description: 'Silk and cotton blouses in timeless cuts.', parent: 'blouses', sizeGuide: 'blouse' },
  { slug: 'occasion-blouses', name: 'Embroidered & Occasion', description: 'Brocade, zardozi and mirror-work blouses for weddings and festivals.', parent: 'blouses', sizeGuide: 'blouse' },
];

export const COLLECTIONS = [
  { slug: 'wedding-edit', name: 'The Wedding Edit', description: 'Kanjivarams, Banarasis and tissues for the ceremonies, and the blouses to wear with them.' },
  { slug: 'everyday-handloom', name: 'Everyday Handloom', description: 'Cottons, linens and Chanderis that soften with every wash.' },
  { slug: 'festive', name: 'Festive', description: 'Colour and zari for Diwali, Pongal, Durga Puja and the season of visits.' },
  { slug: 'under-10000', name: 'Under ₹10,000', description: 'Handwoven saris and blouses that cost less than ₹10,000.' },
  { slug: 'gifting', name: 'Gifting', description: 'Saris chosen to be given: to a mother, a bride, a friend.' },
];

const SILK_CARE = 'Dry clean only. Store folded in a muslin cloth and refold every few months along different lines to rest the zari.';
const COTTON_CARE = 'Hand wash separately in cold water with a mild detergent; dry in shade. A light starch keeps the drape crisp.';

const SARIS: SariProduct[] = [
  // ------------------------------------------------------------------ Kanjivaram
  {
    kind: 'sari', slug: 'meenakshi-temple-border-kanjivaram', name: 'Meenakshi Temple-Border Kanjivaram', sku: 'ANV-MTK',
    category: 'kanjivaram', gender: 'women', price: 38500, variantLabel: 'Option', sizes: STD,
    short: 'A heavy mulberry silk with a contrast temple border, coin buttas across the body and a banded zari pallu.',
    description:
      'The temple border is the signature of Kanchipuram: rows of gopuram teeth rising from the selvedge into the body. Here it is woven in a contrasting colour and joined to the body by korvai, the interlocking technique that keeps the two colours separate thread by thread.\n\n' +
      'Small kasu (coin) buttas are scattered across the body, and the pallu repeats the border colour in broad zari bands.\n\n' +
      '- Pure mulberry silk with zari\n- Contrast border joined by korvai\n- 5.5 m sari with an unstitched 0.8 m blouse piece',
    attributes: [['Weave', 'Kanjivaram, korvai border'], ['Fabric', 'Mulberry silk'], ['Zari', 'Silver-based gold zari'], ['Length', '6.3 m including 0.8 m blouse piece'], ['Width', '1.2 m'], ['Weight', 'About 850 g'], ['Care', SILK_CARE]],
    tags: ['kanjivaram', 'silk', 'temple border', 'bridal', 'zari'],
    flags: { featured: true, bestseller: true },
    design: { weave: 'silk', field: 'coin-butta', border: 'temple', borderWidth: 0.2, pallu: 'bands' },
    colorways: [
      { name: 'Kumkum and Mango', family: 'red', hex: '#8f1730', colors: { body: '#8f1730', border: '#d29a1e', pallu: '#d29a1e', zari: '#d4a94e', accent: '#1f5e3a' } },
      { name: 'Peacock and Rani', family: 'blue', hex: '#0f4c63', colors: { body: '#0f4c63', border: '#b0185a', pallu: '#b0185a', zari: '#d4a94e', accent: '#d29a1e' } },
    ],
    stock: [[3], [2]],
    collections: ['wedding-edit', 'gifting'],
  },
  {
    kind: 'sari', slug: 'kasu-butta-kanjivaram', name: 'Kasu Butta Kanjivaram', sku: 'ANV-KBK',
    category: 'kanjivaram', gender: 'women', price: 32000, variantLabel: 'Option', sizes: STD,
    short: 'Rudraksha border, a field of gold coin buttas and a paisley pallu, in pure Kanchipuram silk.',
    description:
      'A rudraksha border (a row of woven beads between fine zari lines) frames a body scattered with kasu, the gold coin motif traditionally woven for weddings and temple festivals. The pallu opens into a field of mango paisleys.\n\n' +
      '- Pure mulberry silk with zari\n- Rudraksha border, paisley pallu\n- Unstitched blouse piece in the border colour',
    attributes: [['Weave', 'Kanjivaram'], ['Fabric', 'Mulberry silk'], ['Zari', 'Silver-based gold zari'], ['Length', '6.3 m including 0.8 m blouse piece'], ['Width', '1.2 m'], ['Care', SILK_CARE]],
    tags: ['kanjivaram', 'silk', 'coin butta', 'wedding'],
    flags: { new: true },
    design: { weave: 'silk', field: 'coin-butta', motifScale: 0.1, border: 'rudraksha', borderWidth: 0.14, pallu: 'paisley-field' },
    colorways: [
      { name: 'Turmeric and Maroon', family: 'yellow', hex: '#c98a12', colors: { body: '#c98a12', border: '#6e1423', pallu: '#6e1423', zari: '#e0b85c', accent: '#2c6b45' } },
      { name: 'Bottle Green and Magenta', family: 'green', hex: '#1c4a33', colors: { body: '#1c4a33', border: '#9d1c5c', pallu: '#9d1c5c', zari: '#d4a94e', accent: '#d29a1e' } },
    ],
    stock: [[4], [2]],
    collections: ['wedding-edit', 'festive'],
  },
  {
    kind: 'sari', slug: 'vaira-oosi-soft-silk', name: 'Vaira Oosi Soft Silk', sku: 'ANV-VOS',
    category: 'kanjivaram', gender: 'women', price: 14800, variantLabel: 'Option', sizes: STD,
    short: 'A lighter Kanchipuram-style soft silk with star buttas and a fine vine border. Easy to drape for a full day.',
    description:
      'Soft silk is woven with a lighter zari and fewer warp threads than a traditional Kanjivaram, so it falls closer to the body and weighs about half as much. The body carries tiny star (vaira oosi) buttas; the border is a running vine.\n\n' +
      '- Soft silk with zari\n- Vine border, banded pallu\n- Unstitched blouse piece',
    attributes: [['Weave', 'Soft silk, Kanchipuram style'], ['Fabric', 'Silk'], ['Length', '6.2 m including 0.8 m blouse piece'], ['Width', '1.15 m'], ['Weight', 'About 450 g'], ['Care', SILK_CARE]],
    tags: ['soft silk', 'lightweight', 'office', 'festive'],
    flags: { bestseller: true, trending: true },
    design: { weave: 'soft-silk', field: 'star-butta', motifScale: 0.09, border: 'vine', borderWidth: 0.09, pallu: 'bands' },
    colorways: [
      { name: 'Lotus Pink', family: 'pink', hex: '#d36b86', colors: { body: '#d36b86', border: '#6b2141', pallu: '#6b2141', zari: '#d9b363', accent: '#f0c55a' } },
      { name: 'Sandalwood', family: 'beige', hex: '#cfae84', colors: { body: '#cfae84', border: '#7a2a2a', pallu: '#7a2a2a', zari: '#c99b45', accent: '#2f5d4c' } },
      { name: 'Ink Blue', family: 'blue', hex: '#1f2f5a', colors: { body: '#1f2f5a', border: '#a12f3d', pallu: '#a12f3d', zari: '#d4a94e', accent: '#d29a1e' } },
    ],
    stock: [[5], [4], [3]],
    collections: ['festive', 'gifting'],
  },
  // ------------------------------------------------------------------ Banarasi
  {
    kind: 'sari', slug: 'jangla-banarasi-katan', name: 'Jangla Banarasi Katan', sku: 'ANV-JBK',
    category: 'banarasi', gender: 'women', price: 42000, variantLabel: 'Option', sizes: STD,
    short: 'A katan silk brocaded all over with a jangla of leaves and paisleys, finished with a grand konia pallu.',
    description:
      'Jangla is the Banarasi name for a sprawling, all-over lattice of creepers. On this katan silk it is brocaded in zari across the full body, so the sari catches the light from every fold. The pallu opens with a band of konia paisleys before the jangla resumes.\n\n' +
      '- Katan (pure silk) with zari brocade\n- All-over jangla, paisley border\n- Unstitched blouse piece',
    attributes: [['Weave', 'Banarasi kadhua brocade'], ['Fabric', 'Katan silk'], ['Zari', 'Gold zari'], ['Length', '6.3 m including 0.8 m blouse piece'], ['Width', '1.18 m'], ['Weight', 'About 900 g'], ['Care', SILK_CARE]],
    tags: ['banarasi', 'katan', 'brocade', 'bridal'],
    flags: { featured: true, new: true },
    design: { weave: 'katan', field: 'jangla', motifScale: 0.16, border: 'paisley-band', borderWidth: 0.1, pallu: 'grand' },
    colorways: [
      { name: 'Midnight', family: 'blue', hex: '#16213f', colors: { body: '#16213f', motif: '#7c2d4b', border: '#16213f', pallu: '#16213f', zari: '#d4a94e', accent: '#7c2d4b' } },
      { name: 'Wine', family: 'red', hex: '#5a1427', colors: { body: '#5a1427', motif: '#c97a3a', border: '#5a1427', pallu: '#5a1427', zari: '#d9b363', accent: '#1f4a3a' } },
    ],
    stock: [[2], [2]],
    collections: ['wedding-edit'],
  },
  {
    kind: 'sari', slug: 'kadhua-butidar-banarasi', name: 'Kadhua Butidar Banarasi', sku: 'ANV-KBB',
    category: 'banarasi', gender: 'women', price: 27500, variantLabel: 'Option', sizes: STD,
    short: 'Paisley buttis woven one by one in the kadhua technique, on a katan ground with a paisley border.',
    description:
      'In kadhua weaving each butti is woven separately by hand, so there are no loose floats on the reverse. It is slower than cutwork and gives a cleaner, lighter sari. The pallu carries larger paisleys in the same zari.\n\n' +
      '- Katan silk, kadhua buttis\n- Paisley border and pallu\n- Unstitched blouse piece',
    attributes: [['Weave', 'Banarasi kadhua'], ['Fabric', 'Katan silk'], ['Length', '6.3 m including 0.8 m blouse piece'], ['Width', '1.18 m'], ['Care', SILK_CARE]],
    tags: ['banarasi', 'katan', 'butti', 'festive'],
    flags: { trending: true },
    design: { weave: 'katan', field: 'paisley-butta', motifScale: 0.13, border: 'paisley-band', borderWidth: 0.11, pallu: 'paisley-field' },
    colorways: [
      { name: 'Ivory Gold', family: 'white', hex: '#efe6d2', colors: { body: '#efe6d2', border: '#efe6d2', pallu: '#efe6d2', zari: '#c8963a', accent: '#8a2a2a' } },
      { name: 'Emerald', family: 'green', hex: '#0f5a43', colors: { body: '#0f5a43', border: '#0f5a43', pallu: '#0f5a43', zari: '#d4a94e', accent: '#a32646' } },
    ],
    stock: [[3], [3]],
    collections: ['festive', 'wedding-edit', 'gifting'],
  },
  {
    kind: 'sari', slug: 'tanchoi-banarasi', name: 'Tanchoi Banarasi', sku: 'ANV-TBN',
    category: 'banarasi', gender: 'women', price: 19900, variantLabel: 'Option', sizes: STD,
    short: 'A satin-faced silk with a dense tone-on-tone pattern of tiny paisleys and flowers, and a slim zari border.',
    description:
      'Tanchoi is woven with extra weft in silk rather than zari, building a close, all-over pattern that looks embossed. The effect is quiet up close and lustrous across a room.\n\n' +
      '- Satin silk, tanchoi weave\n- Slim zari border, striped pallu\n- Unstitched blouse piece',
    attributes: [['Weave', 'Tanchoi'], ['Fabric', 'Satin silk'], ['Length', '6.2 m including 0.8 m blouse piece'], ['Width', '1.15 m'], ['Care', SILK_CARE]],
    tags: ['banarasi', 'tanchoi', 'satin', 'evening'],
    flags: {},
    design: { weave: 'tanchoi', field: 'tanchoi', motifScale: 0.1, border: 'thin', borderWidth: 0.045, pallu: 'stripes' },
    colorways: [
      { name: 'Black', family: 'black', hex: '#17151a', colors: { body: '#17151a', motif: '#3a2f45', border: '#17151a', pallu: '#17151a', zari: '#cfa553', accent: '#6b2f4f' } },
      { name: 'Plum', family: 'purple', hex: '#4a1d3f', colors: { body: '#4a1d3f', motif: '#6f3a62', border: '#4a1d3f', pallu: '#4a1d3f', zari: '#d4a94e', accent: '#c47a8a' } },
    ],
    stock: [[2], [3]],
    collections: ['festive'],
  },
  // ------------------------------------------------------------------ Chanderi & Maheshwari
  {
    kind: 'sari', slug: 'chanderi-zari-buti', name: 'Chanderi Zari Buti', sku: 'ANV-CZB',
    category: 'chanderi-maheshwari', gender: 'women', price: 7800, variantLabel: 'Option', sizes: STD,
    short: 'A sheer silk-cotton with hand-placed zari buti and a striped border. Light enough for summer weddings.',
    description:
      'Chanderi pairs a silk warp with a fine cotton weft, giving a cloth that is almost translucent and holds its pleats. The coin buti are woven with small hand-held needles, one at a time.\n\n' +
      '- Silk-cotton (silk warp, cotton weft)\n- Zari buti and striped zari border\n- Unstitched blouse piece',
    attributes: [['Weave', 'Chanderi'], ['Fabric', 'Silk-cotton'], ['Length', '6.2 m including 0.8 m blouse piece'], ['Width', '1.12 m'], ['Weight', 'About 350 g'], ['Care', 'Dry clean recommended for the first wash; afterwards gentle hand wash in cold water.']],
    tags: ['chanderi', 'silk cotton', 'summer', 'lightweight'],
    flags: { new: true, bestseller: true },
    design: { weave: 'chanderi', field: 'dot-butta', motifScale: 0.09, border: 'stripes', borderWidth: 0.08, pallu: 'stripes' },
    colorways: [
      { name: 'Mint', family: 'green', hex: '#b9d8c2', colors: { body: '#b9d8c2', border: '#b9d8c2', pallu: '#b9d8c2', zari: '#c9a24a', accent: '#c96a7a' } },
      { name: 'Powder Blue', family: 'blue', hex: '#b4c9df', colors: { body: '#b4c9df', border: '#b4c9df', pallu: '#b4c9df', zari: '#c8c8c8', accent: '#2f3f6b' } },
      { name: 'Ivory', family: 'white', hex: '#f1ead9', colors: { body: '#f1ead9', border: '#f1ead9', pallu: '#f1ead9', zari: '#c9a24a', accent: '#a83a3a' } },
    ],
    stock: [[6], [5], [4]],
    collections: ['everyday-handloom', 'under-10000'],
  },
  {
    kind: 'sari', slug: 'maheshwari-reversible-border', name: 'Maheshwari Reversible Border', sku: 'ANV-MRB',
    category: 'chanderi-maheshwari', gender: 'women', price: 5400, variantLabel: 'Option', sizes: STD,
    short: 'A cotton-silk from Maheshwar with fine stripes and a border that looks the same on both sides.',
    description:
      'Maheshwari saris are known for the bugdi, a reversible border that lets the sari be worn either way out. This one has pin stripes across the body and a pallu of five bands.\n\n' +
      '- Cotton-silk\n- Reversible striped border\n- Unstitched blouse piece',
    attributes: [['Weave', 'Maheshwari'], ['Fabric', 'Cotton-silk'], ['Length', '6.2 m including 0.8 m blouse piece'], ['Width', '1.12 m'], ['Care', COTTON_CARE]],
    tags: ['maheshwari', 'cotton silk', 'stripes', 'office'],
    flags: {},
    design: { weave: 'maheshwari', field: 'stripes', motifScale: 0.1, border: 'stripes', borderWidth: 0.1, pallu: 'stripes' },
    colorways: [
      { name: 'Indigo', family: 'blue', hex: '#26365e', colors: { body: '#26365e', motif: '#5a6f9e', border: '#8a1f2c', pallu: '#26365e', zari: '#c9a24a', accent: '#d48c2a' } },
      { name: 'Rust', family: 'orange', hex: '#a24a22', colors: { body: '#a24a22', motif: '#d9915a', border: '#2a3b2f', pallu: '#a24a22', zari: '#c9a24a', accent: '#f0d08a' } },
    ],
    stock: [[6], [5]],
    collections: ['everyday-handloom', 'under-10000'],
  },
  // ------------------------------------------------------------------ Cotton & Linen
  {
    kind: 'sari', slug: 'handloom-linen-silver-border', name: 'Handloom Linen, Silver Border', sku: 'ANV-HLS',
    category: 'cotton-linen', gender: 'women', price: 6200, variantLabel: 'Option', sizes: STD,
    short: 'Slubbed handloom linen with a narrow silver zari edge. Breathable, crisp and quietly formal.',
    description:
      'Linen is spun from flax and woven on handlooms in a loose plain weave, so it breathes in the heat and keeps a natural slub. A narrow silver zari line edges both borders and the pallu ends in a wide silver band.\n\n' +
      '- 100% linen with silver zari\n- Narrow zari border, zari pallu\n- Unstitched blouse piece',
    attributes: [['Weave', 'Plain handloom'], ['Fabric', 'Linen'], ['Length', '6.2 m including 0.8 m blouse piece'], ['Width', '1.15 m'], ['Care', COTTON_CARE]],
    tags: ['linen', 'office', 'summer', 'minimal'],
    flags: { trending: true },
    design: { weave: 'linen', field: 'plain', border: 'thin', borderWidth: 0.05, pallu: 'plain-zari' },
    colorways: [
      { name: 'Ash', family: 'grey', hex: '#8d8d88', colors: { body: '#8d8d88', border: '#8d8d88', pallu: '#8d8d88', zari: '#cfcfcf', accent: '#3d3d3a' } },
      { name: 'Sage', family: 'green', hex: '#8fa58a', colors: { body: '#8fa58a', border: '#8fa58a', pallu: '#8fa58a', zari: '#d0d0d0', accent: '#46563f' } },
    ],
    stock: [[7], [6]],
    collections: ['everyday-handloom', 'under-10000'],
  },
  {
    kind: 'sari', slug: 'kota-doria-checks', name: 'Kota Doria Checks', sku: 'ANV-KDC',
    category: 'cotton-linen', gender: 'women', price: 4200, variantLabel: 'Option', sizes: STD,
    short: 'The airy square-check weave of Kota in fine cotton, with a slim zari border. The coolest sari in the shop.',
    description:
      'Kota doria is woven with thicker threads at regular intervals, forming the small squares called khats. The open weave makes it one of the lightest saris you can wear in an Indian summer.\n\n' +
      '- Cotton kota doria\n- Slim zari border\n- No blouse piece (pair with a solid cotton blouse)',
    attributes: [['Weave', 'Kota doria (khat checks)'], ['Fabric', 'Cotton'], ['Length', '5.5 m'], ['Width', '1.12 m'], ['Weight', 'About 250 g'], ['Care', COTTON_CARE]],
    tags: ['kota', 'cotton', 'summer', 'checks'],
    flags: { new: true },
    design: { weave: 'kota', field: 'kota-checks', motifScale: 0.12, border: 'thin', borderWidth: 0.045, pallu: 'stripes' },
    colorways: [
      { name: 'Haldi', family: 'yellow', hex: '#e2b43f', colors: { body: '#e2b43f', motif: '#c4901f', border: '#e2b43f', pallu: '#e2b43f', zari: '#c9a24a', accent: '#b03a2e' } },
      { name: 'Rose', family: 'pink', hex: '#e3a3ac', colors: { body: '#e3a3ac', motif: '#c97a86', border: '#e3a3ac', pallu: '#e3a3ac', zari: '#c9a24a', accent: '#6b2a3a' } },
    ],
    stock: [[8], [6]],
    collections: ['everyday-handloom', 'under-10000'],
  },
  {
    kind: 'sari', slug: 'ilkal-tope-teni', name: 'Ilkal Tope Teni', sku: 'ANV-ITT',
    category: 'cotton-linen', gender: 'women', price: 3900, variantLabel: 'Option', sizes: STD,
    short: 'A Karnataka cotton with the interlocking teni border and the three-band tope teni pallu.',
    description:
      'Ilkal saris are woven with the border and pallu joined to the body by a looped technique called tope teni, which gives the pallu its striped, toothed bands. This is a classic Ilkal in cotton with a contrast border.\n\n' +
      '- Cotton body, cotton-silk border\n- Teni border, tope teni pallu\n- No blouse piece',
    attributes: [['Weave', 'Ilkal'], ['Fabric', 'Cotton'], ['Length', '5.5 m'], ['Width', '1.12 m'], ['Care', COTTON_CARE]],
    tags: ['ilkal', 'cotton', 'karnataka', 'everyday'],
    flags: {},
    design: { weave: 'cotton', field: 'checks', motifScale: 0.08, border: 'tope-teni', borderWidth: 0.12, pallu: 'tope-teni' },
    colorways: [
      { name: 'Moss and Pomegranate', family: 'green', hex: '#3b4a2f', colors: { body: '#3b4a2f', motif: '#556b44', border: '#9b2232', pallu: '#9b2232', zari: '#c9a24a', accent: '#f1e8d6' } },
      { name: 'Ink and Ochre', family: 'black', hex: '#1d2230', colors: { body: '#1d2230', motif: '#38415a', border: '#b0702a', pallu: '#b0702a', zari: '#c9a24a', accent: '#f1e8d6' } },
    ],
    stock: [[6], [5]],
    collections: ['everyday-handloom', 'under-10000'],
  },
  // ------------------------------------------------------------------ Organza & Tissue
  {
    kind: 'sari', slug: 'embroidered-organza', name: 'Embroidered Organza', sku: 'ANV-EOR',
    category: 'organza-tissue', gender: 'women', price: 11500, variantLabel: 'Option', sizes: STD,
    short: 'Sheer silk organza scattered with thread-embroidered sprigs and finished with a scalloped border.',
    description:
      'A crisp silk organza that stands away from the body and catches the light. Small sprigs of flowers are embroidered in silk thread with a zari centre, and the edge is finished with embroidered scallops.\n\n' +
      '- Silk organza\n- Thread embroidery with zari accents\n- Unstitched blouse piece in matching silk',
    attributes: [['Fabric', 'Silk organza'], ['Work', 'Thread embroidery, scalloped edge'], ['Length', '6.2 m including 0.8 m blouse piece'], ['Width', '1.12 m'], ['Care', 'Dry clean only.']],
    tags: ['organza', 'embroidered', 'evening', 'sheer'],
    flags: { featured: true, trending: true },
    design: { weave: 'organza', field: 'embroidered-florals', motifScale: 0.15, border: 'scallop', borderWidth: 0.07, pallu: 'plain-zari' },
    colorways: [
      { name: 'Blush', family: 'pink', hex: '#efc9c4', colors: { body: '#efc9c4', motif: '#c25b6e', border: '#c25b6e', pallu: '#efc9c4', zari: '#d4b06a', accent: '#6f8a5e' } },
      { name: 'Pistachio', family: 'green', hex: '#cfdcb8', colors: { body: '#cfdcb8', motif: '#e6a6b0', border: '#7c9a6a', pallu: '#cfdcb8', zari: '#d4b06a', accent: '#7c9a6a' } },
    ],
    stock: [[4], [3]],
    collections: ['festive', 'gifting'],
  },
  {
    kind: 'sari', slug: 'kasavu-tissue', name: 'Kasavu Tissue', sku: 'ANV-KST',
    category: 'organza-tissue', gender: 'women', price: 8900, variantLabel: 'Option', sizes: STD,
    short: 'Kerala ivory tissue with zari in the weft, a wide kasavu border and a gold pallu.',
    description:
      'Kasavu is the gold border of Kerala\'s ivory saris. In tissue, zari is woven through the weft as well, so the whole sari carries a soft metallic glow. Worn for Onam, Vishu and weddings.\n\n' +
      '- Cotton tissue with zari weft\n- Wide kasavu border, zari pallu\n- Unstitched blouse piece',
    attributes: [['Weave', 'Kerala kasavu, tissue'], ['Fabric', 'Cotton with zari'], ['Length', '6.2 m including 0.8 m blouse piece'], ['Width', '1.15 m'], ['Care', 'Dry clean recommended.']],
    tags: ['kasavu', 'kerala', 'tissue', 'onam'],
    flags: { bestseller: true },
    design: { weave: 'tissue', field: 'plain', border: 'thin', borderWidth: 0.11, pallu: 'plain-zari' },
    colorways: [
      { name: 'Ivory and Gold', family: 'white', hex: '#f0e6cf', colors: { body: '#f0e6cf', border: '#f0e6cf', pallu: '#f0e6cf', zari: '#cfa553', accent: '#8a1f2c' } },
    ],
    stock: [[7]],
    collections: ['festive', 'under-10000', 'gifting'],
  },
];

const BLOUSE_CARE = 'Dry clean only. Iron on the reverse on a low setting.';

const BLOUSES: BlouseProduct[] = [
  {
    kind: 'blouse', slug: 'classic-silk-elbow-sleeve-blouse', name: 'Classic Silk Blouse, Elbow Sleeve', sku: 'ANV-CSE',
    category: 'classic-blouses', gender: 'women', price: 3600, variantLabel: 'Size', sizes: BUST,
    short: 'A raw-silk blouse with a round neck, elbow sleeves and a fine zari edge. The one to own in several colours.',
    description:
      'Cut with princess darts for a close fit and lined in cotton. The round neck and elbow sleeves suit almost any sari, from a Kanjivaram to a linen.\n\n' +
      '- Raw silk, cotton lining\n- Front hook opening\n- 1.5 cm seam allowance at the sides for alterations',
    attributes: [['Fabric', 'Raw silk'], ['Lining', 'Cotton'], ['Neck', 'Round'], ['Sleeve', 'Elbow length'], ['Opening', 'Front hooks'], ['Care', BLOUSE_CARE]],
    tags: ['blouse', 'silk', 'readymade', 'essential'],
    flags: { bestseller: true },
    design: { weave: 'soft-silk', field: 'plain', neck: 'round', sleeve: 'elbow', back: 'round', trim: 'zari', embroidery: 'none', dori: false },
    colorways: [
      { name: 'Antique Gold', family: 'yellow', hex: '#b88a3e', colors: { body: '#b88a3e', trim: '#b88a3e', zari: '#e0c070' } },
      { name: 'Maroon', family: 'red', hex: '#5e1424', colors: { body: '#5e1424', trim: '#5e1424', zari: '#d4a94e' } },
      { name: 'Black', family: 'black', hex: '#161417', colors: { body: '#161417', trim: '#161417', zari: '#cfa553' } },
      { name: 'Emerald', family: 'green', hex: '#0f5a43', colors: { body: '#0f5a43', trim: '#0f5a43', zari: '#d4a94e' } },
    ],
    stock: [[2, 4, 5, 4, 3, 1], [2, 3, 5, 4, 2, 1], [3, 4, 6, 5, 3, 2], [1, 3, 4, 3, 2, 0]],
    collections: ['everyday-handloom'],
  },
  {
    kind: 'blouse', slug: 'boat-neck-brocade-blouse', name: 'Boat-Neck Brocade Blouse', sku: 'ANV-BNB',
    category: 'occasion-blouses', gender: 'women', price: 4900, variantLabel: 'Size', sizes: BUST,
    short: 'A Banarasi brocade blouse with a wide boat neck and short sleeves, for plain silks and organzas.',
    description:
      'A dense zari brocade with silk paisleys showing through, cut with a wide boat neck that frames the collarbones. Pairs especially well with a solid silk or a sheer organza.\n\n' +
      '- Banarasi brocade, satin lining\n- Back zip with hook\n- Short sleeves',
    attributes: [['Fabric', 'Silk brocade'], ['Lining', 'Satin'], ['Neck', 'Boat'], ['Sleeve', 'Short'], ['Opening', 'Back zip'], ['Care', BLOUSE_CARE]],
    tags: ['blouse', 'brocade', 'banarasi', 'occasion'],
    flags: { new: true, featured: true },
    design: { weave: 'katan', field: 'brocade', motifScale: 0.09, neck: 'boat', sleeve: 'short', back: 'round', trim: 'piping', embroidery: 'none', dori: false },
    colorways: [
      { name: 'Gold on Wine', family: 'red', hex: '#6b1a2e', colors: { body: '#6b1a2e', trim: '#6b1a2e', zari: '#d4a94e' } },
      { name: 'Silver on Midnight', family: 'blue', hex: '#1a2340', colors: { body: '#1a2340', trim: '#1a2340', zari: '#c9cbd0' } },
    ],
    stock: [[1, 3, 4, 3, 2, 1], [1, 2, 3, 3, 1, 0]],
    collections: ['wedding-edit', 'festive'],
  },
  {
    kind: 'blouse', slug: 'deep-back-dori-blouse', name: 'Deep-Back Dori Blouse', sku: 'ANV-DBD',
    category: 'classic-blouses', gender: 'women', price: 2900, variantLabel: 'Size', sizes: BUST,
    short: 'A cotton-silk blouse with a deep U back, tasselled dori ties and three-quarter sleeves.',
    description:
      'A simple front with a deep U at the back, closed with a twisted cotton dori finished in tassels. The three-quarter sleeves make it a good partner for handloom cottons and linens.\n\n' +
      '- Cotton-silk, cotton lining\n- Front hooks, back dori\n- Three-quarter sleeves',
    attributes: [['Fabric', 'Cotton-silk'], ['Lining', 'Cotton'], ['Neck', 'Round front, deep U back'], ['Sleeve', 'Three-quarter'], ['Opening', 'Front hooks, back tie'], ['Care', 'Gentle hand wash in cold water, or dry clean.']],
    tags: ['blouse', 'cotton silk', 'dori', 'backless'],
    flags: { trending: true },
    design: { weave: 'chanderi', field: 'plain', neck: 'round', sleeve: 'three-quarter', back: 'deep-u', trim: 'piping', embroidery: 'none', dori: true },
    colorways: [
      { name: 'Ivory', family: 'white', hex: '#efe7d6', colors: { body: '#efe7d6', trim: '#b04a2a', zari: '#c9a24a' } },
      { name: 'Rust', family: 'orange', hex: '#a24a22', colors: { body: '#a24a22', trim: '#2f2620', zari: '#c9a24a' } },
    ],
    stock: [[3, 5, 6, 5, 3, 2], [2, 4, 5, 4, 3, 1]],
    collections: ['everyday-handloom', 'under-10000'],
  },
  {
    kind: 'blouse', slug: 'mirror-work-sleeveless-blouse', name: 'Mirror-Work Sleeveless Blouse', sku: 'ANV-MWS',
    category: 'occasion-blouses', gender: 'women', price: 6800, variantLabel: 'Size', sizes: BUST,
    short: 'Hand-set mirrors in silk thread around a V neck, on a sleeveless cotton-silk blouse with a dori back.',
    description:
      'Small mirrors are set by hand and held with buttonhole stitches in silk thread, a technique from Kutch. They run around the V neck and catch candlelight beautifully.\n\n' +
      '- Cotton-silk, cotton lining\n- Hand-set mirror work\n- Back dori with tassels',
    attributes: [['Fabric', 'Cotton-silk'], ['Lining', 'Cotton'], ['Work', 'Hand mirror work'], ['Neck', 'V'], ['Sleeve', 'Sleeveless'], ['Care', BLOUSE_CARE]],
    tags: ['blouse', 'mirror work', 'sleeveless', 'festive'],
    flags: { new: true },
    design: { weave: 'chanderi', field: 'plain', neck: 'v', sleeve: 'sleeveless', back: 'deep-v', trim: 'piping', embroidery: 'mirror', dori: true },
    colorways: [
      { name: 'Black', family: 'black', hex: '#18161a', colors: { body: '#18161a', trim: '#18161a', zari: '#cfa553', accent: '#b0244a' } },
      { name: 'Indigo', family: 'blue', hex: '#243766', colors: { body: '#243766', trim: '#243766', zari: '#cfa553', accent: '#e0a23a' } },
    ],
    stock: [[2, 3, 4, 3, 2, 1], [1, 3, 3, 3, 2, 0]],
    collections: ['festive'],
  },
  {
    kind: 'blouse', slug: 'zardozi-sweetheart-blouse', name: 'Zardozi Sweetheart Blouse', sku: 'ANV-ZSB',
    category: 'occasion-blouses', gender: 'women', price: 9500, variantLabel: 'Size', sizes: BUST,
    short: 'A silk blouse with a sweetheart neck framed in hand zardozi, elbow sleeves and a deep U back with dori.',
    description:
      'Zardozi is embroidery in metal wire and sequins, worked by hand on a frame. Here it outlines the sweetheart neck and the sleeve edges, on a silk scattered with tiny zari dots. Made for a bridal Kanjivaram or Banarasi.\n\n' +
      '- Silk, satin lining\n- Hand zardozi\n- Deep U back with dori',
    attributes: [['Fabric', 'Silk'], ['Lining', 'Satin'], ['Work', 'Hand zardozi'], ['Neck', 'Sweetheart'], ['Sleeve', 'Elbow length'], ['Care', BLOUSE_CARE]],
    tags: ['blouse', 'zardozi', 'bridal', 'embroidered'],
    flags: { featured: true },
    design: { weave: 'silk', field: 'dot-butta', motifScale: 0.06, neck: 'sweetheart', sleeve: 'elbow', back: 'deep-u', trim: 'zari', embroidery: 'zardozi', dori: true },
    colorways: [
      { name: 'Wine', family: 'red', hex: '#6b1630', colors: { body: '#6b1630', trim: '#6b1630', zari: '#d4a94e' } },
      { name: 'Bottle Green', family: 'green', hex: '#173f2e', colors: { body: '#173f2e', trim: '#173f2e', zari: '#d4a94e' } },
    ],
    stock: [[1, 2, 3, 2, 1, 1], [1, 2, 2, 2, 1, 0]],
    collections: ['wedding-edit', 'gifting'],
  },
  {
    kind: 'blouse', slug: 'everyday-cotton-blouse', name: 'Everyday Cotton Blouse', sku: 'ANV-ECB',
    category: 'classic-blouses', gender: 'women', price: 1650, variantLabel: 'Size', sizes: BUST,
    short: 'A soft cotton blouse with a high round neck and short sleeves, for daily cotton and linen saris.',
    description:
      'The plainest blouse we make, and the one we reach for most. Mul cotton that gets softer with washing, a high round neck and short sleeves.\n\n' +
      '- Mul cotton, cotton lining\n- Front hooks\n- Short sleeves',
    attributes: [['Fabric', 'Mul cotton'], ['Lining', 'Cotton'], ['Neck', 'High round'], ['Sleeve', 'Short'], ['Opening', 'Front hooks'], ['Care', COTTON_CARE]],
    tags: ['blouse', 'cotton', 'everyday', 'essential'],
    flags: { bestseller: true },
    design: { weave: 'cotton', field: 'plain', neck: 'high', sleeve: 'short', back: 'round', trim: 'none', embroidery: 'none', dori: false },
    colorways: [
      { name: 'White', family: 'white', hex: '#f3efe6', colors: { body: '#f3efe6', trim: '#f3efe6', zari: '#c9a24a' } },
      { name: 'Black', family: 'black', hex: '#1b1a1c', colors: { body: '#1b1a1c', trim: '#1b1a1c', zari: '#c9a24a' } },
      { name: 'Indigo', family: 'blue', hex: '#26365e', colors: { body: '#26365e', trim: '#26365e', zari: '#c9a24a' } },
    ],
    stock: [[4, 6, 8, 7, 5, 3], [4, 6, 8, 6, 5, 3], [3, 5, 6, 5, 4, 2]],
    collections: ['everyday-handloom', 'under-10000'],
  },
];

export const PRODUCTS: SampleProduct[] = [...SARIS, ...BLOUSES];

export const SARI_VIEWS: SariView[] = ['fold', 'drape', 'detail'];
export const BLOUSE_VIEWS: BlouseView[] = ['front', 'back', 'detail'];
export const viewsFor = (p: SampleProduct): string[] => (p.kind === 'sari' ? SARI_VIEWS : BLOUSE_VIEWS);

/** Product photographs are portrait 4:5. */
export const PHOTO_WIDTH = 1200;
export const PHOTO_HEIGHT = 1500;
