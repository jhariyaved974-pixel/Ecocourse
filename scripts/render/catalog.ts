// Sample catalogue for development and demos. These are ORIGINAL placeholder
// designs (rendered from procedural 3D models), not real branded merchandise.
// Product copy describes the design only; no performance or certification claims.

import type { Colorway } from './build-shoe';
import type { Silhouette } from './shoe-designs';

export type ColorFamily =
  | 'black' | 'white' | 'grey' | 'beige' | 'brown' | 'blue' | 'green' | 'red' | 'pink' | 'purple' | 'yellow' | 'orange' | 'multi';

export interface SampleColorway extends Colorway {
  family: ColorFamily;
  hex: string;
}

export interface SampleProduct {
  slug: string;
  name: string;
  sku: string;
  silhouette: Silhouette;
  category: string;
  gender: 'men' | 'women' | 'kids' | 'unisex';
  price: number; // rupees (MRP)
  salePrice?: number; // rupees
  short: string;
  description: string;
  attributes: [string, string][];
  tags: string[];
  flags: { featured?: boolean; new?: boolean; bestseller?: boolean; trending?: boolean };
  colorways: SampleColorway[];
  sizes: string[];
  stock: number[][]; // [colorway][size]
  collections: string[];
}

const UK = ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'];

export const CATEGORIES = [
  { slug: 'sneakers', name: 'Sneakers', description: 'Clean everyday silhouettes built around comfortable cupsoles and easy styling.' },
  { slug: 'running', name: 'Running', description: 'Cushioned, breathable pairs designed for daily miles and recovery runs.' },
  { slug: 'sports', name: 'Sports', description: 'Court and training shoes with supportive uppers and grippy outsoles.' },
  { slug: 'casual', name: 'Casual', description: 'Slip-ons and easy pairs for errands, travel and long days on your feet.' },
  { slug: 'formal', name: 'Formal', description: 'Polished leather shoes for the office, weddings and evenings out.' },
  { slug: 'boots', name: 'Boots', description: 'Lugged soles and protective uppers for trails, monsoon streets and travel.' },
  { slug: 'sandals', name: 'Sandals & Slides', description: 'Contoured footbeds and soft straps for warm days and quick outings.' },
] as const;

export const COLLECTIONS = [
  { slug: 'new-season', name: 'New Season', description: 'The latest additions to the AUREN line-up.' },
  { slug: 'everyday-essentials', name: 'Everyday Essentials', description: 'Versatile pairs that work from Monday to Sunday.' },
  { slug: 'performance', name: 'Performance', description: 'Pairs designed for running, training and the court.' },
];

export const PRODUCTS: SampleProduct[] = [
  {
    slug: 'velocity-runner-x',
    name: 'Velocity Runner X',
    sku: 'AU-VRX',
    silhouette: 'runner',
    category: 'running',
    gender: 'unisex',
    price: 8999,
    salePrice: 7499,
    short: 'A high-cushion daily runner with a breathable engineered-knit upper and a rocker-shaped foam midsole.',
    description:
      'Velocity Runner X pairs a soft engineered-knit upper with a tall foam midsole and a gentle toe spring for smooth heel-to-toe transitions.\n\n' +
      '- Engineered knit upper with a padded collar\n- Dual-density foam midsole with a pronounced rocker\n- Rubber outsole in high-wear zones\n- Reflective-look heel tab',
    attributes: [['Upper', 'Engineered knit'], ['Midsole', 'Dual-density foam'], ['Outsole', 'Rubber'], ['Heel-to-toe drop', 'Approx. 10 mm'], ['Closure', 'Lace-up']],
    tags: ['running', 'cushioned', 'knit', 'daily-trainer'],
    flags: { featured: true, bestseller: true, trending: true },
    colorways: [
      { name: 'Volt Night', family: 'black', hex: '#1f2937', upper: '#1f2937', accent: '#d7f25b', overlay: '#111827', sole: '#f5f3ef', outsole: '#2b2b2b', lining: '#d7f25b', laces: '#f5f3ef' },
      { name: 'Glacier', family: 'white', hex: '#e8eef2', upper: '#e8eef2', accent: '#2563eb', overlay: '#cbd5e1', sole: '#ffffff', outsole: '#64748b', lining: '#2563eb', laces: '#ffffff' },
      { name: 'Ember', family: 'orange', hex: '#c2410c', upper: '#c2410c', accent: '#1c1917', overlay: '#9a3412', sole: '#faf7f2', outsole: '#1c1917', lining: '#1c1917', laces: '#faf7f2' },
    ],
    sizes: UK,
    stock: [[4, 9, 12, 10, 6, 2], [3, 7, 8, 0, 5, 3], [0, 2, 5, 6, 4, 1]],
    collections: ['performance', 'new-season'],
  },
  {
    slug: 'urban-street-pro',
    name: 'Urban Street Pro',
    sku: 'AU-USP',
    silhouette: 'court',
    category: 'sneakers',
    gender: 'unisex',
    price: 5499,
    short: 'A clean low-top court sneaker with a smooth leather-look upper and a stitched cupsole.',
    description:
      'Urban Street Pro is our everyday court silhouette: a minimal upper with layered overlays, a padded collar and a flat, stable cupsole.\n\n' +
      '- Smooth synthetic leather upper\n- Stitched rubber cupsole\n- Padded tongue and collar\n- Contrast heel counter',
    attributes: [['Upper', 'Synthetic leather'], ['Sole', 'Rubber cupsole'], ['Lining', 'Textile'], ['Closure', 'Lace-up'], ['Fit', 'True to size']],
    tags: ['court', 'leather', 'everyday', 'minimal'],
    flags: { featured: true, bestseller: true },
    colorways: [
      { name: 'Bone Forest', family: 'beige', hex: '#ede6da', upper: '#ede6da', accent: '#14532d', overlay: '#e2d9c8', sole: '#f7f3ea', outsole: '#b59f7c', lining: '#14532d', laces: '#ede6da' },
      { name: 'Triple Black', family: 'black', hex: '#18181b', upper: '#18181b', accent: '#3f3f46', overlay: '#27272a', sole: '#1c1c1f', outsole: '#0a0a0a', lining: '#3f3f46', laces: '#18181b' },
    ],
    sizes: UK,
    stock: [[6, 10, 14, 12, 8, 4], [5, 8, 9, 9, 6, 2]],
    collections: ['everyday-essentials'],
  },
  {
    slug: 'aeroflex-sport',
    name: 'AeroFlex Sport',
    sku: 'AU-AFS',
    silhouette: 'trainer',
    category: 'sports',
    gender: 'unisex',
    price: 6499,
    salePrice: 5199,
    short: 'A low-drop training shoe with a wide forefoot, a supportive heel wrap and flexible grooves.',
    description:
      'AeroFlex Sport is built for gym sessions and mixed training. A wider forefoot platform and a firm heel wrap keep you planted through lateral moves.\n\n' +
      '- Breathable mesh upper with a supportive side panel\n- Low-drop, stable foam midsole\n- Wraparound heel counter\n- Multi-directional rubber outsole',
    attributes: [['Upper', 'Mesh with synthetic overlays'], ['Midsole', 'Stable foam'], ['Outsole', 'Rubber'], ['Heel-to-toe drop', 'Approx. 4 mm'], ['Closure', 'Lace-up']],
    tags: ['training', 'gym', 'stable', 'mesh'],
    flags: { new: true, trending: true },
    colorways: [
      { name: 'Cobalt Flame', family: 'blue', hex: '#1e3a8a', upper: '#1e3a8a', accent: '#f97316', overlay: '#172554', sole: '#f1f5f9', outsole: '#1e293b', lining: '#f97316', laces: '#f1f5f9' },
      { name: 'Storm Grey', family: 'grey', hex: '#6b7280', upper: '#6b7280', accent: '#f43f5e', overlay: '#4b5563', sole: '#f8fafc', outsole: '#374151', lining: '#f43f5e', laces: '#f8fafc' },
    ],
    sizes: UK,
    stock: [[3, 6, 8, 7, 5, 2], [2, 5, 6, 6, 3, 0]],
    collections: ['performance', 'new-season'],
  },
  {
    slug: 'midnight-leather-classic',
    name: 'Midnight Leather Classic',
    sku: 'AU-MLC',
    silhouette: 'oxford',
    category: 'formal',
    gender: 'men',
    price: 7999,
    short: 'A sleek cap-toe Oxford with a polished finish, closed lacing and a stacked heel.',
    description:
      'Midnight Leather Classic is a refined cap-toe Oxford for the office and occasions. A slim last, a polished upper and a stacked heel give it a sharp profile.\n\n' +
      '- Polished leather-look upper\n- Cap-toe with closed lacing\n- Cushioned footbed\n- Stacked heel with rubber top piece',
    attributes: [['Upper', 'Polished leather-look'], ['Construction', 'Cap-toe Oxford'], ['Sole', 'Rubber with stacked heel'], ['Lining', 'Textile'], ['Closure', 'Closed lacing']],
    tags: ['oxford', 'formal', 'office', 'leather'],
    flags: { featured: true },
    colorways: [
      { name: 'Midnight Black', family: 'black', hex: '#111113', upper: '#111113', accent: '#18181b', overlay: '#0b0b0c', sole: '#1a1410', outsole: '#120c08', lining: '#4a3122', laces: '#111113' },
      { name: 'Cognac', family: 'brown', hex: '#7c3f1d', upper: '#7c3f1d', accent: '#5c2e14', overlay: '#6b3418', sole: '#2a1a10', outsole: '#1a100a', lining: '#d6b48a', laces: '#3b1f0f' },
    ],
    sizes: UK,
    stock: [[2, 5, 7, 6, 4, 2], [1, 3, 4, 4, 2, 1]],
    collections: ['everyday-essentials'],
  },
  {
    slug: 'cloudstep-everyday',
    name: 'CloudStep Everyday',
    sku: 'AU-CSE',
    silhouette: 'slipon',
    category: 'casual',
    gender: 'women',
    price: 3999,
    salePrice: 3299,
    short: 'A laceless knit slip-on with a soft foam sole and an easy pull-on heel tab.',
    description:
      'CloudStep Everyday is the pair you reach for without thinking. A stretch-knit upper slips on easily and a soft, lightweight foam sole keeps errands comfortable.\n\n' +
      '- Stretch knit upper\n- Laceless slip-on design with heel pull tab\n- Lightweight foam sole\n- Soft textile lining',
    attributes: [['Upper', 'Stretch knit'], ['Sole', 'Lightweight foam'], ['Closure', 'Slip-on'], ['Lining', 'Soft textile'], ['Fit', 'Snug; size up if between sizes']],
    tags: ['slip-on', 'knit', 'travel', 'lightweight'],
    flags: { new: true, bestseller: true },
    colorways: [
      { name: 'Oat', family: 'beige', hex: '#d9cbb3', upper: '#d9cbb3', accent: '#a8977a', overlay: '#cbbba0', sole: '#fbf9f4', outsole: '#d9cbb3', lining: '#a8977a', laces: '#d9cbb3' },
      { name: 'Sage', family: 'green', hex: '#9caf98', upper: '#9caf98', accent: '#5f7360', overlay: '#8ea08a', sole: '#fbf9f4', outsole: '#9caf98', lining: '#5f7360', laces: '#9caf98' },
      { name: 'Charcoal', family: 'grey', hex: '#3f3f46', upper: '#3f3f46', accent: '#18181b', overlay: '#27272a', sole: '#e7e5e4', outsole: '#3f3f46', lining: '#18181b', laces: '#3f3f46' },
    ],
    sizes: ['UK 3', 'UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8'],
    stock: [[5, 8, 10, 9, 6, 3], [4, 6, 7, 6, 3, 2], [3, 5, 6, 5, 4, 2]],
    collections: ['everyday-essentials', 'new-season'],
  },
  {
    slug: 'phantom-high-top',
    name: 'Phantom High-Top',
    sku: 'AU-PHT',
    silhouette: 'high',
    category: 'sneakers',
    gender: 'unisex',
    price: 5999,
    short: 'A heritage-inspired high-top with a canvas upper, a rubber toe cap and a vulcanised-look sole.',
    description:
      'Phantom High-Top takes a classic high-top shape and gives it clean, modern proportions, with a tall padded collar and a contrast ankle patch.\n\n' +
      '- Durable canvas upper\n- Rubber toe cap and flat sole\n- Padded high collar\n- Contrast ankle patch',
    attributes: [['Upper', 'Canvas'], ['Sole', 'Rubber'], ['Height', 'High-top'], ['Closure', 'Lace-up'], ['Fit', 'True to size']],
    tags: ['high-top', 'canvas', 'street', 'heritage'],
    flags: { trending: true },
    colorways: [
      { name: 'Shadow', family: 'black', hex: '#141414', upper: '#141414', accent: '#b91c1c', overlay: '#1f1f1f', sole: '#f5f2ea', outsole: '#141414', lining: '#e7e5e4', laces: '#f5f2ea' },
      { name: 'Cream Maroon', family: 'beige', hex: '#f3ebdd', upper: '#f3ebdd', accent: '#7f1d1d', overlay: '#e8dcc6', sole: '#f5f2ea', outsole: '#7f1d1d', lining: '#7f1d1d', laces: '#f3ebdd' },
    ],
    sizes: UK,
    stock: [[4, 7, 9, 8, 5, 2], [3, 6, 0, 5, 4, 1]],
    collections: ['new-season'],
  },
  {
    slug: 'trailforce-outdoor',
    name: 'TrailForce Outdoor',
    sku: 'AU-TFO',
    silhouette: 'boot',
    category: 'boots',
    gender: 'men',
    price: 9499,
    salePrice: 8299,
    short: 'A mid-cut hiking boot with a lugged outsole, a protective rubber mudguard and padded ankle support.',
    description:
      'TrailForce Outdoor is built for weekend trails and monsoon commutes. A protective mudguard wraps the lower upper and a deeply lugged outsole bites into loose ground.\n\n' +
      '- Suede-look upper with rubber mudguard\n- Deep multi-directional lugs\n- Padded collar and gusseted tongue\n- Speed-lace eyelets',
    attributes: [['Upper', 'Suede-look synthetic'], ['Outsole', 'Lugged rubber'], ['Height', 'Mid-cut'], ['Closure', 'Lace-up'], ['Use', 'Hiking and travel']],
    tags: ['boot', 'hiking', 'outdoor', 'lugged'],
    flags: { featured: true, trending: true },
    colorways: [
      { name: 'Moss', family: 'green', hex: '#4d5b3a', upper: '#4d5b3a', accent: '#c2410c', overlay: '#3a4529', sole: '#3f3a33', outsole: '#1c1a17', lining: '#c2410c', laces: '#c2410c' },
      { name: 'Desert', family: 'brown', hex: '#b08d57', upper: '#b08d57', accent: '#3f3a33', overlay: '#9a7746', sole: '#e7dcc8', outsole: '#3f3a33', lining: '#3f3a33', laces: '#3f3a33' },
    ],
    sizes: UK,
    stock: [[2, 4, 6, 6, 4, 2], [2, 3, 5, 5, 3, 1]],
    collections: ['performance'],
  },
  {
    slug: 'courtvision-elite',
    name: 'CourtVision Elite',
    sku: 'AU-CVE',
    silhouette: 'basketball',
    category: 'sports',
    gender: 'men',
    price: 10999,
    short: 'A mid-top court shoe with a padded ankle collar, a supportive heel wrap and a cushioned platform.',
    description:
      'CourtVision Elite is designed for the court and the street. A mid-top collar, a sculpted heel wrap and a cushioned platform give it a bold, confident stance.\n\n' +
      '- Synthetic upper with layered overlays\n- Mid-top padded collar\n- Cushioned foam platform\n- Herringbone-style rubber outsole',
    attributes: [['Upper', 'Synthetic with overlays'], ['Midsole', 'Cushioned foam'], ['Outsole', 'Rubber'], ['Height', 'Mid-top'], ['Closure', 'Lace-up']],
    tags: ['basketball', 'court', 'mid-top', 'cushioned'],
    flags: { featured: true, new: true },
    colorways: [
      { name: 'Royal', family: 'white', hex: '#f5f5f4', upper: '#f5f5f4', accent: '#1d4ed8', overlay: '#e7e5e4', sole: '#ffffff', outsole: '#1d4ed8', lining: '#1d4ed8', laces: '#f5f5f4' },
      { name: 'Crimson', family: 'red', hex: '#991b1b', upper: '#991b1b', accent: '#fafaf9', overlay: '#7f1d1d', sole: '#fafaf9', outsole: '#1c1917', lining: '#fafaf9', laces: '#fafaf9' },
    ],
    sizes: UK,
    stock: [[1, 3, 5, 5, 3, 1], [1, 2, 3, 3, 2, 0]],
    collections: ['performance', 'new-season'],
  },
  {
    slug: 'coastline-slide',
    name: 'Coastline Slide',
    sku: 'AU-CLS',
    silhouette: 'slide',
    category: 'sandals',
    gender: 'unisex',
    price: 1799,
    salePrice: 1499,
    short: 'A one-piece slide with a contoured footbed and a soft, wide strap.',
    description:
      'Coastline Slide is an easy pair for home, travel and the beach. A contoured footbed cradles your foot and the wide strap stays put without pinching.\n\n' +
      '- Moulded foam construction\n- Contoured footbed\n- Wide padded strap\n- Textured outsole',
    attributes: [['Material', 'Moulded foam'], ['Footbed', 'Contoured'], ['Outsole', 'Textured'], ['Water friendly', 'Yes'], ['Fit', 'Size down if between sizes']],
    tags: ['slide', 'sandal', 'summer', 'water-friendly'],
    flags: { bestseller: true },
    colorways: [
      { name: 'Sand', family: 'beige', hex: '#cdb48c', upper: '#cdb48c', accent: '#b39a72', overlay: '#c2a97f', sole: '#efe6d6', outsole: '#bfa982', lining: '#f6efe2', laces: '#cdb48c' },
      { name: 'Ocean', family: 'blue', hex: '#1e3a5f', upper: '#1e3a5f', accent: '#0f2440', overlay: '#18304f', sole: '#35587f', outsole: '#0f2440', lining: '#9cc3e6', laces: '#1e3a5f' },
      { name: 'Onyx', family: 'black', hex: '#1c1c1e', upper: '#1c1c1e', accent: '#0a0a0b', overlay: '#141416', sole: '#2e2e31', outsole: '#0a0a0b', lining: '#4a4a4f', laces: '#1c1c1e' },
    ],
    sizes: UK,
    stock: [[8, 12, 15, 14, 10, 6], [6, 9, 12, 10, 7, 4], [6, 10, 12, 12, 8, 5]],
    collections: ['everyday-essentials'],
  },
];

export type PhotoView = 'hero34' | 'side' | 'top' | 'back34';
export const PRODUCT_VIEWS: PhotoView[] = ['hero34', 'side', 'top'];
