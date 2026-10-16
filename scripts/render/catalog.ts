// Sample catalogue for development and demos. These are ORIGINAL placeholder
// products (rendered from procedural 3D models), not real branded merchandise.
// Product copy describes the design only; no performance, safety or
// certification claims.

import type { Colorway } from './build-shoe';
import type { Silhouette } from './shoe-designs';

export type ColorFamily =
  | 'black' | 'white' | 'grey' | 'beige' | 'brown' | 'blue' | 'green' | 'red' | 'pink' | 'purple' | 'yellow' | 'orange' | 'multi';

export interface SampleColorway extends Colorway {
  family: ColorFamily;
  hex: string;
}

/** Palette for procedural (non-shoe) products: main body, secondary parts, small accents. */
export interface ItemColorway {
  name: string;
  family: ColorFamily;
  hex: string;
  primary: string;
  secondary: string;
  accent: string;
}

/** Procedural model builders in scripts/render/items/. */
export type ItemModel =
  // items/tech-toys.ts
  | 'earbuds' | 'headphones' | 'smartwatch' | 'powerbank' | 'speaker' | 'lantern' | 'blocks' | 'plush'
  // items/home-beauty.ts
  | 'bottle' | 'mugs' | 'frypan' | 'lamp' | 'planters' | 'serum' | 'lotion' | 'bodywash'
  // items/style-sport.ts
  | 'tshirt' | 'backpack' | 'sunglasses' | 'wallet' | 'yogamat' | 'dumbbells' | 'notebooks' | 'pens';

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
  /** Name of the variant option shown to shoppers, e.g. "Size", "Strap size". */
  variantLabel: string;
  /** Option values; a single 'Standard' value means the product has no options. */
  sizes: string[];
  stock: number[][]; // [colorway][option]
  collections: string[];
}

export interface ShoeProduct extends BaseProduct {
  kind: 'shoe';
  silhouette: Silhouette;
  colorways: SampleColorway[];
}

export interface ItemProduct extends BaseProduct {
  kind: 'item';
  model: ItemModel;
  colorways: ItemColorway[];
}

export type SampleProduct = ShoeProduct | ItemProduct;

const UK = ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'];
const STD = ['Standard'];

export interface SampleCategory {
  slug: string;
  name: string;
  description: string;
  /** Parent category slug (two levels at most). */
  parent?: string;
  /** Size guide shown on product pages in this category (see baseline content). */
  sizeGuide?: 'footwear' | 'clothing';
}

// Top-level departments first, then their sub-categories.
export const CATEGORIES: SampleCategory[] = [
  { slug: 'electronics', name: 'Electronics', description: 'Audio, wearables and the everyday tech accessories you actually use.' },
  { slug: 'fashion', name: 'Fashion', description: 'Wardrobe basics, bags and accessories at honest prices.' },
  { slug: 'footwear', name: 'Footwear', description: 'Sneakers, running shoes, formal pairs, boots and sandals.', sizeGuide: 'footwear' },
  { slug: 'home-kitchen', name: 'Home & Kitchen', description: 'Kitchen essentials and small touches that make a home.' },
  { slug: 'beauty', name: 'Beauty & Personal Care', description: 'Skincare and daily personal-care staples.' },
  { slug: 'sports-fitness', name: 'Sports & Fitness', description: 'Gear for home workouts, yoga and the outdoors.' },
  { slug: 'toys-kids', name: 'Toys & Kids', description: 'Playful, giftable picks for little ones.' },
  { slug: 'books-stationery', name: 'Books & Stationery', description: 'Notebooks, pens and desk supplies for work and study.' },

  { slug: 'audio', name: 'Audio', description: 'Earbuds, headphones and portable speakers.', parent: 'electronics' },
  { slug: 'wearables', name: 'Smartwatches & Wearables', description: 'Smartwatches and fitness bands.', parent: 'electronics' },
  { slug: 'tech-accessories', name: 'Mobile & Laptop Accessories', description: 'Power banks, chargers and cables.', parent: 'electronics' },

  { slug: 'clothing', name: 'Clothing', description: 'Everyday tees and wardrobe basics.', parent: 'fashion', sizeGuide: 'clothing' },
  { slug: 'bags-wallets', name: 'Bags & Wallets', description: 'Backpacks, wallets and travel bags.', parent: 'fashion' },
  { slug: 'fashion-accessories', name: 'Sunglasses & Accessories', description: 'Sunglasses and finishing touches.', parent: 'fashion' },

  { slug: 'sneakers', name: 'Sneakers', description: 'Clean everyday silhouettes built around comfortable cupsoles and easy styling.', parent: 'footwear', sizeGuide: 'footwear' },
  { slug: 'running', name: 'Running', description: 'Cushioned, breathable pairs designed for daily miles and recovery runs.', parent: 'footwear', sizeGuide: 'footwear' },
  { slug: 'sports', name: 'Sports Shoes', description: 'Court and training shoes with supportive uppers and grippy outsoles.', parent: 'footwear', sizeGuide: 'footwear' },
  { slug: 'casual', name: 'Casual', description: 'Slip-ons and easy pairs for errands, travel and long days on your feet.', parent: 'footwear', sizeGuide: 'footwear' },
  { slug: 'formal', name: 'Formal', description: 'Polished leather shoes for the office, weddings and evenings out.', parent: 'footwear', sizeGuide: 'footwear' },
  { slug: 'boots', name: 'Boots', description: 'Lugged soles and protective uppers for trails, monsoon streets and travel.', parent: 'footwear', sizeGuide: 'footwear' },
  { slug: 'sandals', name: 'Sandals & Slides', description: 'Contoured footbeds and soft straps for warm days and quick outings.', parent: 'footwear', sizeGuide: 'footwear' },

  { slug: 'kitchen-dining', name: 'Kitchen & Dining', description: 'Bottles, mugs and cookware for every day.', parent: 'home-kitchen' },
  { slug: 'home-decor', name: 'Home Décor', description: 'Lamps, planters and small decor pieces.', parent: 'home-kitchen' },

  { slug: 'skincare', name: 'Skincare', description: 'Serums, moisturisers and daily skincare.', parent: 'beauty' },
  { slug: 'personal-care', name: 'Bath & Body', description: 'Body washes and bath-time basics.', parent: 'beauty' },

  { slug: 'fitness', name: 'Fitness', description: 'Mats, weights and home-workout gear.', parent: 'sports-fitness' },
  { slug: 'outdoor', name: 'Outdoor & Camping', description: 'Lanterns and kit for trips and power cuts.', parent: 'sports-fitness' },
];

export const COLLECTIONS = [
  { slug: 'new-season', name: 'New Season', description: 'The latest additions across every department.' },
  { slug: 'everyday-essentials', name: 'Everyday Essentials', description: 'Useful, good-value things you reach for every day.' },
  { slug: 'performance', name: 'Sport & Performance', description: 'Running shoes, training gear and outdoor kit.' },
  { slug: 'under-999', name: 'Under ₹999', description: 'Great finds that cost less than ₹999.' },
  { slug: 'gift-ideas', name: 'Gift Ideas', description: 'Easy, well-loved gifts for friends and family.' },
];

const ITEMS: ItemProduct[] = [
  // ------------------------------------------------------------------ Electronics
  {
    kind: 'item', model: 'earbuds', variantLabel: 'Option', sizes: STD,
    slug: 'pulse-wireless-earbuds', name: 'Pulse Wireless Earbuds', sku: 'STM-PWE', category: 'audio', gender: 'unisex',
    price: 4999, salePrice: 2999,
    short: 'Compact true-wireless earbuds with a pocketable charging case and touch controls.',
    description:
      'Pulse earbuds sit light in the ear and pair quickly with your phone. The slim case tops them up on the go.\n\n' +
      '- Three sizes of silicone ear tips in the box\n- Touch controls for music and calls\n- USB-C charging case\n- Up to 6 hours per charge, 24 hours with the case (varies with use)',
    attributes: [['Connectivity', 'Bluetooth 5.3'], ['Charging', 'USB-C'], ['Playback (earbuds)', 'Up to 6 hours'], ['Playback (with case)', 'Up to 24 hours'], ['In the box', 'Earbuds, case, cable, ear tips']],
    tags: ['earbuds', 'wireless', 'audio', 'bluetooth'],
    flags: { featured: true, bestseller: true, trending: true },
    colorways: [
      { name: 'Graphite', family: 'black', hex: '#2b2d31', primary: '#2b2d31', secondary: '#1a1b1e', accent: '#9ca3af' },
      { name: 'Pearl', family: 'white', hex: '#f1f0ec', primary: '#f1f0ec', secondary: '#d9d7d0', accent: '#a3a3a3' },
    ],
    stock: [[40], [28]],
    collections: ['everyday-essentials', 'gift-ideas'],
  },
  {
    kind: 'item', model: 'headphones', variantLabel: 'Option', sizes: STD,
    slug: 'orbit-over-ear-headphones', name: 'Orbit Over-Ear Headphones', sku: 'STM-OOH', category: 'audio', gender: 'unisex',
    price: 6999, salePrice: 4499,
    short: 'Cushioned over-ear wireless headphones that fold flat for travel.',
    description:
      'Orbit headphones wrap your ears in soft memory-foam cushions and fold flat into the included pouch.\n\n' +
      '- Padded, adjustable headband\n- Fold-flat ear cups\n- 3.5 mm cable for wired listening\n- Up to 40 hours of playback (varies with use)',
    attributes: [['Type', 'Over-ear, wireless'], ['Connectivity', 'Bluetooth 5.3, 3.5 mm'], ['Playback', 'Up to 40 hours'], ['Charging', 'USB-C'], ['Weight', 'Approx. 250 g']],
    tags: ['headphones', 'wireless', 'audio', 'travel'],
    flags: { featured: true, new: true },
    colorways: [
      { name: 'Midnight', family: 'black', hex: '#1f2430', primary: '#1f2430', secondary: '#3a4150', accent: '#c8a46a' },
      { name: 'Sand', family: 'beige', hex: '#d8c8ad', primary: '#d8c8ad', secondary: '#f1e9da', accent: '#8a7350' },
      { name: 'Sage', family: 'green', hex: '#8fa58d', primary: '#8fa58d', secondary: '#dfe6dc', accent: '#3f4e3d' },
    ],
    stock: [[18], [12], [9]],
    collections: ['new-season', 'gift-ideas'],
  },
  {
    kind: 'item', model: 'smartwatch', variantLabel: 'Strap size', sizes: ['S/M', 'M/L'],
    slug: 'stride-smartwatch-2', name: 'Stride Smartwatch 2', sku: 'STM-SSW', category: 'wearables', gender: 'unisex',
    price: 5499, salePrice: 3999,
    short: 'A bright square-display smartwatch with a soft silicone strap and week-long battery.',
    description:
      'Stride 2 shows notifications, steps and sleep at a glance on a bright, rounded display. Pick the strap size that fits your wrist.\n\n' +
      '- 1.8-inch touch display\n- Step, sleep and heart-rate tracking (not a medical device)\n- Magnetic charger\n- Up to 7 days of battery (varies with use)',
    attributes: [['Display', '1.8-inch touch'], ['Battery', 'Up to 7 days'], ['Strap', 'Silicone, quick release'], ['Compatibility', 'Android and iOS'], ['Strap sizes', 'S/M 130–180 mm, M/L 160–210 mm']],
    tags: ['smartwatch', 'wearable', 'fitness-tracker'],
    flags: { trending: true, new: true },
    colorways: [
      { name: 'Black', family: 'black', hex: '#18181b', primary: '#18181b', secondary: '#27272a', accent: '#22c55e' },
      { name: 'Rose', family: 'pink', hex: '#e8b4b8', primary: '#e8b4b8', secondary: '#d9d4cf', accent: '#be185d' },
    ],
    stock: [[14, 16], [10, 6]],
    collections: ['new-season', 'performance', 'gift-ideas'],
  },
  {
    kind: 'item', model: 'powerbank', variantLabel: 'Option', sizes: STD,
    slug: 'volt-20000-power-bank', name: 'Volt 20000 mAh Power Bank', sku: 'STM-VPB', category: 'tech-accessories', gender: 'unisex',
    price: 2499, salePrice: 1599,
    short: 'A slim 20000 mAh power bank with USB-C in/out and two USB-A ports.',
    description:
      'Volt keeps your phone, earbuds and tablet going through long days and travel. A row of LEDs shows how much charge is left.\n\n' +
      '- 20000 mAh capacity\n- USB-C input/output plus two USB-A outputs\n- LED charge indicator\n- Textured, grippy finish',
    attributes: [['Capacity', '20000 mAh'], ['Ports', '1 × USB-C, 2 × USB-A'], ['Indicator', '4 LEDs'], ['Weight', 'Approx. 380 g'], ['In the box', 'Power bank, USB-C cable']],
    tags: ['power-bank', 'charging', 'travel', 'usb-c'],
    flags: { bestseller: true },
    colorways: [
      { name: 'Black', family: 'black', hex: '#1c1c1f', primary: '#1c1c1f', secondary: '#2d2d31', accent: '#38bdf8' },
      { name: 'White', family: 'white', hex: '#efefec', primary: '#efefec', secondary: '#d4d4d0', accent: '#38bdf8' },
    ],
    stock: [[35], [22]],
    collections: ['everyday-essentials'],
  },
  {
    kind: 'item', model: 'speaker', variantLabel: 'Option', sizes: STD,
    slug: 'boom-mini-speaker', name: 'Boom Mini Bluetooth Speaker', sku: 'STM-BMS', category: 'audio', gender: 'unisex',
    price: 2999, salePrice: 1899,
    short: 'A palm-sized fabric-wrapped speaker with a carry strap and punchy sound.',
    description:
      'Boom Mini is small enough for a bag pocket and loud enough for a room. The fabric wrap and strap make it easy to take anywhere.\n\n' +
      '- Fabric-wrapped cylindrical body\n- Detachable carry strap\n- Up to 10 hours of playback (varies with volume)\n- Built-in microphone for calls',
    attributes: [['Output', '5 W'], ['Connectivity', 'Bluetooth 5.3'], ['Playback', 'Up to 10 hours'], ['Charging', 'USB-C'], ['Size', 'Approx. 8 × 8 × 10 cm']],
    tags: ['speaker', 'bluetooth', 'portable', 'audio'],
    flags: { trending: true },
    colorways: [
      { name: 'Teal', family: 'blue', hex: '#1f7a7a', primary: '#1f7a7a', secondary: '#155e5e', accent: '#f8fafc' },
      { name: 'Coral', family: 'orange', hex: '#f0786a', primary: '#f0786a', secondary: '#c85a4d', accent: '#fff7ed' },
      { name: 'Charcoal', family: 'grey', hex: '#3f3f46', primary: '#3f3f46', secondary: '#27272a', accent: '#e4e4e7' },
    ],
    stock: [[16], [12], [20]],
    collections: ['gift-ideas'],
  },
  {
    kind: 'item', model: 'lantern', variantLabel: 'Option', sizes: STD,
    slug: 'trailhead-camping-lantern', name: 'Trailhead Rechargeable Lantern', sku: 'STM-TRL', category: 'outdoor', gender: 'unisex',
    price: 1599, salePrice: 1099,
    short: 'A rechargeable LED lantern with a fold-down handle for camping and power cuts.',
    description:
      'Trailhead gives soft, even light for tents, balconies and power cuts. Three brightness levels and a fold-down handle.\n\n' +
      '- Three brightness levels\n- USB-C rechargeable\n- Fold-down hanging handle\n- Frosted diffuser for glare-free light',
    attributes: [['Light', 'LED, 3 modes'], ['Charging', 'USB-C'], ['Run time', 'Up to 12 hours on low'], ['Height', 'Approx. 18 cm'], ['Weight', 'Approx. 320 g']],
    tags: ['lantern', 'camping', 'outdoor', 'led'],
    flags: {},
    colorways: [
      { name: 'Forest', family: 'green', hex: '#2f4f3a', primary: '#2f4f3a', secondary: '#1f2a22', accent: '#fde68a' },
      { name: 'Sunset', family: 'orange', hex: '#d9622b', primary: '#d9622b', secondary: '#2a2a2a', accent: '#fde68a' },
    ],
    stock: [[12], [10]],
    collections: ['performance'],
  },
  // ------------------------------------------------------------------ Toys & Kids
  {
    kind: 'item', model: 'blocks', variantLabel: 'Option', sizes: STD,
    slug: 'build-and-play-blocks', name: 'Build & Play Blocks (120 pcs)', sku: 'STM-BPB', category: 'toys-kids', gender: 'kids',
    price: 1499, salePrice: 999,
    short: 'A tub of 120 chunky building blocks in bright colours for open-ended play.',
    description:
      'Big, easy-to-grip blocks that click together for towers, cars and anything else little builders imagine. Stores neatly in the tub.\n\n' +
      '- 120 pieces in 8 colours\n- Large pieces sized for small hands\n- Storage tub with lid\n- Suitable for ages 3 and up',
    attributes: [['Pieces', '120'], ['Age', '3 years and up'], ['Material', 'ABS plastic'], ['Storage', 'Tub with lid'], ['Warning', 'Contains small parts; adult supervision advised']],
    tags: ['toys', 'building-blocks', 'kids', 'gift'],
    flags: { bestseller: true },
    colorways: [
      { name: 'Multicolour', family: 'multi', hex: '#f59e0b', primary: '#ef4444', secondary: '#3b82f6', accent: '#facc15' },
    ],
    stock: [[25]],
    collections: ['gift-ideas'],
  },
  {
    kind: 'item', model: 'plush', variantLabel: 'Option', sizes: STD,
    slug: 'cuddle-bear-plush', name: 'Cuddle Bear Plush Toy (30 cm)', sku: 'STM-CBP', category: 'toys-kids', gender: 'kids',
    price: 899, salePrice: 599,
    short: 'A huggable 30 cm teddy bear with a soft, short-pile coat.',
    description:
      'Cuddle Bear is soft, squishy and just the right size to carry around. Embroidered eyes and nose, no small parts.\n\n' +
      '- 30 cm tall when seated\n- Short-pile plush coat\n- Embroidered features\n- Surface washable',
    attributes: [['Height', '30 cm'], ['Material', 'Polyester plush and fibre fill'], ['Features', 'Embroidered eyes and nose'], ['Care', 'Surface wash only'], ['Age', '0 years and up']],
    tags: ['plush', 'teddy-bear', 'kids', 'gift'],
    flags: { new: true },
    colorways: [
      { name: 'Honey', family: 'brown', hex: '#b9814a', primary: '#b9814a', secondary: '#e8c9a3', accent: '#2b1d14' },
      { name: 'Cream', family: 'beige', hex: '#efe3cf', primary: '#efe3cf', secondary: '#f8f1e6', accent: '#3a2b20' },
    ],
    stock: [[20], [14]],
    collections: ['gift-ideas', 'under-999'],
  },
  // ------------------------------------------------------------------ Home & Kitchen
  {
    kind: 'item', model: 'bottle', variantLabel: 'Option', sizes: STD,
    slug: 'thermosteel-bottle-1l', name: 'ThermoSteel Insulated Bottle (1 L)', sku: 'STM-TSB', category: 'kitchen-dining', gender: 'unisex',
    price: 1199, salePrice: 699,
    short: 'A double-wall stainless steel bottle that keeps drinks hot or cold for hours.',
    description:
      'ThermoSteel holds a full litre and keeps water cold through a hot day or tea warm on a long commute. The leak-resistant cap has a carry loop.\n\n' +
      '- 1 litre capacity\n- Double-wall vacuum insulation\n- Leak-resistant screw cap with loop\n- Powder-coated grip finish',
    attributes: [['Capacity', '1 litre'], ['Material', 'Stainless steel'], ['Insulation', 'Double-wall vacuum'], ['Keeps cold', 'Up to 24 hours'], ['Care', 'Hand wash']],
    tags: ['bottle', 'insulated', 'kitchen', 'travel'],
    flags: { bestseller: true, featured: true },
    colorways: [
      { name: 'Ocean Blue', family: 'blue', hex: '#1d4e89', primary: '#1d4e89', secondary: '#c0c4c8', accent: '#0f172a' },
      { name: 'Matte Black', family: 'black', hex: '#1f1f22', primary: '#1f1f22', secondary: '#c0c4c8', accent: '#0a0a0a' },
      { name: 'Mint', family: 'green', hex: '#a7d8c4', primary: '#a7d8c4', secondary: '#c0c4c8', accent: '#1f3d33' },
    ],
    stock: [[30], [26], [18]],
    collections: ['everyday-essentials', 'under-999'],
  },
  {
    kind: 'item', model: 'mugs', variantLabel: 'Option', sizes: STD,
    slug: 'stoneware-mug-set', name: 'Stoneware Coffee Mugs (Set of 4)', sku: 'STM-SMS', category: 'kitchen-dining', gender: 'unisex',
    price: 1499, salePrice: 999,
    short: 'Four 350 ml stoneware mugs with a speckled reactive glaze.',
    description:
      'Generous 350 ml mugs with a comfortable handle and a speckled glaze that makes each one slightly different.\n\n' +
      '- Set of 4, 350 ml each\n- Glazed stoneware\n- Microwave and dishwasher safe\n- Comfortable C-shaped handle',
    attributes: [['Set', '4 mugs'], ['Capacity', '350 ml each'], ['Material', 'Stoneware'], ['Microwave safe', 'Yes'], ['Dishwasher safe', 'Yes']],
    tags: ['mugs', 'coffee', 'kitchen', 'gift'],
    flags: {},
    colorways: [
      { name: 'Speckled White', family: 'white', hex: '#efe9df', primary: '#efe9df', secondary: '#8a7a68', accent: '#3b3027' },
      { name: 'Terracotta', family: 'orange', hex: '#b5603c', primary: '#b5603c', secondary: '#e9d7c6', accent: '#5a2d1a' },
    ],
    stock: [[15], [11]],
    collections: ['gift-ideas'],
  },
  {
    kind: 'item', model: 'frypan', variantLabel: 'Option', sizes: STD,
    slug: 'everyday-nonstick-fry-pan', name: 'Everyday Non-Stick Fry Pan (26 cm)', sku: 'STM-NFP', category: 'kitchen-dining', gender: 'unisex',
    price: 1899, salePrice: 1299,
    short: 'A 26 cm aluminium fry pan with a non-stick coating and a cool-touch handle.',
    description:
      'The pan for eggs, dosas and stir-fries. A thick base spreads heat evenly and the handle stays comfortable to hold.\n\n' +
      '- 26 cm diameter\n- Non-stick coating\n- Works on gas and induction\n- Cool-touch handle',
    attributes: [['Diameter', '26 cm'], ['Material', 'Aluminium with non-stick coating'], ['Hob', 'Gas and induction'], ['Handle', 'Cool-touch'], ['Care', 'Hand wash recommended']],
    tags: ['cookware', 'fry-pan', 'non-stick', 'kitchen'],
    flags: { trending: true },
    colorways: [
      { name: 'Charcoal', family: 'grey', hex: '#2f3033', primary: '#2f3033', secondary: '#1b1b1d', accent: '#b8b8bc' },
    ],
    stock: [[19]],
    collections: ['everyday-essentials'],
  },
  {
    kind: 'item', model: 'lamp', variantLabel: 'Option', sizes: STD,
    slug: 'lumen-led-table-lamp', name: 'Lumen LED Table Lamp', sku: 'STM-LTL', category: 'home-decor', gender: 'unisex',
    price: 2199, salePrice: 1499,
    short: 'A dimmable LED table lamp with a dome shade and weighted base.',
    description:
      'Lumen casts warm, even light for reading and work. Touch to dim through three levels.\n\n' +
      '- Dome shade with frosted diffuser\n- Three-level touch dimming\n- Weighted metal base\n- USB-C powered',
    attributes: [['Light', 'LED, warm white'], ['Dimming', '3 levels, touch'], ['Power', 'USB-C'], ['Height', 'Approx. 34 cm'], ['Material', 'Metal and acrylic']],
    tags: ['lamp', 'lighting', 'home-decor', 'desk'],
    flags: { new: true },
    colorways: [
      { name: 'Warm White', family: 'white', hex: '#f3efe6', primary: '#f3efe6', secondary: '#c9a46a', accent: '#fff4d6' },
      { name: 'Black', family: 'black', hex: '#202022', primary: '#202022', secondary: '#c9a46a', accent: '#fff4d6' },
    ],
    stock: [[10], [9]],
    collections: ['new-season'],
  },
  {
    kind: 'item', model: 'planters', variantLabel: 'Option', sizes: STD,
    slug: 'ceramic-planter-set', name: 'Ceramic Planter Set (Set of 3)', sku: 'STM-CPS', category: 'home-decor', gender: 'unisex',
    price: 1299, salePrice: 849,
    short: 'Three nesting ceramic planters with drainage holes and saucers.',
    description:
      'Three sizes of matte ceramic planters for succulents, herbs and small indoor plants. Each has a drainage hole and saucer.\n\n' +
      '- Set of 3 (10, 13 and 16 cm)\n- Matte glazed ceramic\n- Drainage holes with saucers\n- Plants not included',
    attributes: [['Set', '3 planters'], ['Sizes', '10, 13 and 16 cm'], ['Material', 'Ceramic'], ['Drainage', 'Yes, with saucers'], ['Plants', 'Not included']],
    tags: ['planters', 'home-decor', 'garden', 'gift'],
    flags: {},
    colorways: [
      { name: 'White', family: 'white', hex: '#f2f1ed', primary: '#f2f1ed', secondary: '#b8a58b', accent: '#4d7c4a' },
      { name: 'Sage', family: 'green', hex: '#9fb39a', primary: '#9fb39a', secondary: '#b8a58b', accent: '#4d7c4a' },
    ],
    stock: [[14], [12]],
    collections: ['under-999', 'gift-ideas'],
  },
  // ------------------------------------------------------------------ Beauty & Personal Care
  {
    kind: 'item', model: 'serum', variantLabel: 'Option', sizes: STD,
    slug: 'hydraglow-face-serum', name: 'HydraGlow Face Serum (30 ml)', sku: 'STM-HFS', category: 'skincare', gender: 'unisex',
    price: 899, salePrice: 649,
    short: 'A lightweight hydrating serum in a glass dropper bottle.',
    description:
      'A water-light serum with glycerin and hyaluronic acid that absorbs quickly under moisturiser or sunscreen.\n\n' +
      '- 30 ml glass dropper bottle\n- Lightweight, non-sticky texture\n- Fragrance-free\n- Patch test before first use',
    attributes: [['Volume', '30 ml'], ['Key ingredients', 'Glycerin, hyaluronic acid'], ['Skin type', 'All skin types'], ['Fragrance', 'Fragrance-free'], ['Use', 'Morning and night, before moisturiser']],
    tags: ['skincare', 'serum', 'hydrating'],
    flags: { trending: true },
    colorways: [
      { name: 'Amber Glass', family: 'orange', hex: '#a8642a', primary: '#a8642a', secondary: '#f5f2ec', accent: '#1f1f1f' },
    ],
    stock: [[45]],
    collections: ['under-999'],
  },
  {
    kind: 'item', model: 'lotion', variantLabel: 'Option', sizes: STD,
    slug: 'daily-moisturising-lotion', name: 'Daily Moisturising Lotion (200 ml)', sku: 'STM-DML', category: 'skincare', gender: 'unisex',
    price: 599, salePrice: 449,
    short: 'A light everyday body and face lotion in a pump bottle.',
    description:
      'An easy everyday moisturiser that sinks in quickly, with shea butter and aloe. The pump makes it simple to use.\n\n' +
      '- 200 ml pump bottle\n- Shea butter and aloe vera\n- Light, non-greasy feel\n- For face and body',
    attributes: [['Volume', '200 ml'], ['Key ingredients', 'Shea butter, aloe vera'], ['Texture', 'Light lotion'], ['Use', 'Face and body'], ['Pack', 'Pump bottle']],
    tags: ['skincare', 'moisturiser', 'lotion'],
    flags: { bestseller: true },
    colorways: [
      { name: 'Classic', family: 'white', hex: '#f4f1ea', primary: '#f4f1ea', secondary: '#7aa37a', accent: '#2f4f2f' },
    ],
    stock: [[50]],
    collections: ['everyday-essentials', 'under-999'],
  },
  {
    kind: 'item', model: 'bodywash', variantLabel: 'Option', sizes: STD,
    slug: 'citrus-fresh-body-wash', name: 'Citrus Fresh Body Wash (250 ml)', sku: 'STM-CBW', category: 'personal-care', gender: 'unisex',
    price: 399, salePrice: 299,
    short: 'A zesty, gentle body wash with orange and lemongrass.',
    description:
      'A rich-lathering body wash with a bright orange and lemongrass scent for a fresh start to the day.\n\n' +
      '- 250 ml flip-cap bottle\n- Orange and lemongrass scent\n- Gentle, soap-free formula\n- Suitable for daily use',
    attributes: [['Volume', '250 ml'], ['Scent', 'Orange and lemongrass'], ['Formula', 'Soap-free'], ['Pack', 'Flip-cap bottle'], ['Use', 'Daily']],
    tags: ['body-wash', 'bath', 'personal-care'],
    flags: {},
    colorways: [
      { name: 'Orange', family: 'orange', hex: '#f59e0b', primary: '#f59e0b', secondary: '#fffbeb', accent: '#166534' },
    ],
    stock: [[60]],
    collections: ['everyday-essentials', 'under-999'],
  },
  // ------------------------------------------------------------------ Fashion
  {
    kind: 'item', model: 'tshirt', variantLabel: 'Size', sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    slug: 'everyday-cotton-tee', name: 'Everyday Cotton Crew Tee', sku: 'STM-ECT', category: 'clothing', gender: 'unisex',
    price: 799, salePrice: 499,
    short: 'A soft 180 GSM cotton crew-neck tee with a relaxed regular fit.',
    description:
      'The tee you will wear on repeat: soft combed cotton, a neat ribbed collar and a regular fit that works on its own or layered.\n\n' +
      '- 100% combed cotton, 180 GSM\n- Ribbed crew neck\n- Regular fit\n- Machine wash cold',
    attributes: [['Material', '100% cotton'], ['Weight', '180 GSM'], ['Fit', 'Regular'], ['Neck', 'Crew'], ['Care', 'Machine wash cold, dry in shade']],
    tags: ['t-shirt', 'cotton', 'basics', 'clothing'],
    flags: { bestseller: true, featured: true },
    colorways: [
      { name: 'White', family: 'white', hex: '#f5f5f2', primary: '#f5f5f2', secondary: '#e5e5e0', accent: '#d4d4cf' },
      { name: 'Black', family: 'black', hex: '#1c1c1e', primary: '#1c1c1e', secondary: '#2a2a2d', accent: '#3a3a3d' },
      { name: 'Olive', family: 'green', hex: '#6b7045', primary: '#6b7045', secondary: '#5d6239', accent: '#4f5330' },
      { name: 'Navy', family: 'blue', hex: '#1e2a44', primary: '#1e2a44', secondary: '#18233a', accent: '#121a2c' },
    ],
    stock: [[8, 14, 16, 10, 5], [10, 18, 18, 12, 6], [4, 8, 9, 6, 2], [6, 10, 0, 7, 3]],
    collections: ['everyday-essentials', 'under-999'],
  },
  {
    kind: 'item', model: 'backpack', variantLabel: 'Option', sizes: STD,
    slug: 'metro-laptop-backpack', name: 'Metro 25 L Laptop Backpack', sku: 'STM-MLB', category: 'bags-wallets', gender: 'unisex',
    price: 2999, salePrice: 1799,
    short: 'A 25 litre everyday backpack with a padded 15.6-inch laptop sleeve.',
    description:
      'Metro is sized for office days and short trips: a padded laptop sleeve, organiser pockets and a luggage pass-through.\n\n' +
      '- 25 litre capacity\n- Padded sleeve fits up to 15.6-inch laptops\n- Water-resistant coated fabric\n- Luggage trolley pass-through',
    attributes: [['Capacity', '25 litres'], ['Laptop sleeve', 'Up to 15.6 inches'], ['Material', 'Coated polyester'], ['Pockets', '6'], ['Dimensions', 'Approx. 46 × 31 × 15 cm']],
    tags: ['backpack', 'laptop-bag', 'travel', 'office'],
    flags: { featured: true },
    colorways: [
      { name: 'Charcoal', family: 'grey', hex: '#3b3d42', primary: '#3b3d42', secondary: '#2a2b2f', accent: '#f97316' },
      { name: 'Navy', family: 'blue', hex: '#223554', primary: '#223554', secondary: '#1a2840', accent: '#e5e7eb' },
    ],
    stock: [[16], [13]],
    collections: ['everyday-essentials'],
  },
  {
    kind: 'item', model: 'sunglasses', variantLabel: 'Option', sizes: STD,
    slug: 'classic-aviator-sunglasses', name: 'Classic Aviator Sunglasses', sku: 'STM-CAS', category: 'fashion-accessories', gender: 'unisex',
    price: 1999, salePrice: 999,
    short: 'Lightweight metal-frame aviators with tinted lenses and a hard case.',
    description:
      'A timeless aviator shape with a thin metal frame, adjustable nose pads and tinted lenses. Comes with a hard case and cloth.\n\n' +
      '- Lightweight metal frame\n- Tinted lenses with UV400 filter\n- Adjustable nose pads\n- Hard case and cleaning cloth included',
    attributes: [['Frame', 'Metal'], ['Lens', 'Tinted, UV400 filter'], ['Lens width', '58 mm'], ['In the box', 'Hard case, cleaning cloth'], ['Fit', 'Medium']],
    tags: ['sunglasses', 'aviator', 'accessories'],
    flags: { trending: true },
    colorways: [
      { name: 'Gold Green', family: 'yellow', hex: '#c9a54a', primary: '#c9a54a', secondary: '#2f4a2f', accent: '#8b6f2a' },
      { name: 'Gunmetal Grey', family: 'grey', hex: '#55585e', primary: '#55585e', secondary: '#2b2d31', accent: '#3a3c40' },
    ],
    stock: [[20], [17]],
    collections: ['gift-ideas'],
  },
  {
    kind: 'item', model: 'wallet', variantLabel: 'Option', sizes: STD,
    slug: 'slim-leather-wallet', name: 'Slim Leather Bifold Wallet', sku: 'STM-SLW', category: 'bags-wallets', gender: 'unisex',
    price: 1299, salePrice: 799,
    short: 'A slim genuine-leather bifold with six card slots and a note pocket.',
    description:
      'A slim bifold that does not bulk up your pocket: six card slots, a full-length note pocket and neat edge stitching.\n\n' +
      '- Genuine leather\n- 6 card slots, 1 note pocket\n- Slim profile\n- Gift box included',
    attributes: [['Material', 'Genuine leather'], ['Card slots', '6'], ['Note pocket', '1'], ['Size (closed)', 'Approx. 11 × 9 cm'], ['Packaging', 'Gift box']],
    tags: ['wallet', 'leather', 'accessories', 'gift'],
    flags: {},
    colorways: [
      { name: 'Tan', family: 'brown', hex: '#a0673a', primary: '#a0673a', secondary: '#7a4a26', accent: '#e8d7c0' },
      { name: 'Black', family: 'black', hex: '#1b1b1c', primary: '#1b1b1c', secondary: '#111112', accent: '#3a3a3a' },
    ],
    stock: [[22], [25]],
    collections: ['gift-ideas', 'under-999'],
  },
  // ------------------------------------------------------------------ Sports & Fitness
  {
    kind: 'item', model: 'yogamat', variantLabel: 'Option', sizes: STD,
    slug: 'flexgrip-yoga-mat', name: 'FlexGrip Yoga Mat (6 mm)', sku: 'STM-FYM', category: 'fitness', gender: 'unisex',
    price: 1499, salePrice: 899,
    short: 'A cushioned 6 mm yoga mat with a textured grip surface and carry strap.',
    description:
      'Enough cushioning for knees and wrists with a textured surface for grip. Rolls up with the included strap.\n\n' +
      '- 6 mm thick\n- Textured non-slip surface\n- 183 × 61 cm\n- Carry strap included',
    attributes: [['Thickness', '6 mm'], ['Size', '183 × 61 cm'], ['Material', 'TPE foam'], ['Weight', 'Approx. 900 g'], ['In the box', 'Mat, carry strap']],
    tags: ['yoga', 'fitness', 'home-workout'],
    flags: { bestseller: true },
    colorways: [
      { name: 'Lavender', family: 'purple', hex: '#a78bcb', primary: '#a78bcb', secondary: '#6d5a8c', accent: '#2b2b2b' },
      { name: 'Teal', family: 'blue', hex: '#2a8c8c', primary: '#2a8c8c', secondary: '#1d6363', accent: '#2b2b2b' },
      { name: 'Charcoal', family: 'grey', hex: '#3d3f44', primary: '#3d3f44', secondary: '#27282c', accent: '#f97316' },
    ],
    stock: [[18], [15], [20]],
    collections: ['performance', 'under-999'],
  },
  {
    kind: 'item', model: 'dumbbells', variantLabel: 'Weight', sizes: ['2 × 2 kg', '2 × 3 kg', '2 × 5 kg'],
    slug: 'powergrip-neoprene-dumbbells', name: 'PowerGrip Neoprene Dumbbells (Pair)', sku: 'STM-PND', category: 'fitness', gender: 'unisex',
    price: 1299, salePrice: 999,
    short: 'A pair of neoprene-coated hex dumbbells that will not roll away.',
    description:
      'Neoprene-coated cast iron with a hexagonal shape so they stay put on the floor. Choose the weight that suits your workout.\n\n' +
      '- Sold as a pair\n- Neoprene coating for a comfortable grip\n- Anti-roll hex ends\n- Weight marked on each end',
    attributes: [['Sold as', 'Pair'], ['Material', 'Cast iron, neoprene coating'], ['Shape', 'Hexagonal, anti-roll'], ['Weights', '2, 3 or 5 kg each'], ['Use', 'Home workouts']],
    tags: ['dumbbells', 'fitness', 'strength', 'home-workout'],
    flags: {},
    colorways: [
      { name: 'Coral', family: 'orange', hex: '#f26b5b', primary: '#f26b5b', secondary: '#2b2b2b', accent: '#ffffff' },
      { name: 'Black', family: 'black', hex: '#232326', primary: '#232326', secondary: '#111113', accent: '#f97316' },
    ],
    stock: [[10, 12, 6], [12, 14, 8]],
    collections: ['performance'],
  },
  // ------------------------------------------------------------------ Books & Stationery
  {
    kind: 'item', model: 'notebooks', variantLabel: 'Option', sizes: STD,
    slug: 'dot-grid-notebook-a5', name: 'Dot Grid Notebook A5 (2-pack)', sku: 'STM-DGN', category: 'books-stationery', gender: 'unisex',
    price: 499, salePrice: 349,
    short: 'Two A5 hardcover notebooks with 160 pages of dot-grid paper each.',
    description:
      'Lay-flat hardcover notebooks with thick 100 GSM dot-grid paper for notes, planning and sketching.\n\n' +
      '- Pack of 2, A5\n- 160 numbered pages each\n- 100 GSM dot-grid paper\n- Ribbon marker and back pocket',
    attributes: [['Size', 'A5 (14.8 × 21 cm)'], ['Pages', '160 each'], ['Paper', '100 GSM, dot grid'], ['Cover', 'Hardcover'], ['Pack', '2 notebooks']],
    tags: ['notebook', 'stationery', 'journal'],
    flags: { new: true },
    colorways: [
      { name: 'Kraft', family: 'brown', hex: '#b08a5b', primary: '#b08a5b', secondary: '#f3eee4', accent: '#2b2b2b' },
      { name: 'Black', family: 'black', hex: '#1e1e20', primary: '#1e1e20', secondary: '#f3eee4', accent: '#c9a54a' },
    ],
    stock: [[40], [35]],
    collections: ['under-999', 'new-season'],
  },
  {
    kind: 'item', model: 'pens', variantLabel: 'Option', sizes: STD,
    slug: 'smooth-gel-pen-set', name: 'Smooth Gel Pen Set (10 colours)', sku: 'STM-SGP', category: 'books-stationery', gender: 'unisex',
    price: 299, salePrice: 199,
    short: 'Ten 0.5 mm gel pens in bright colours with comfortable grips.',
    description:
      'Smooth-writing 0.5 mm gel pens in ten colours for notes, planners and colour coding.\n\n' +
      '- 10 colours\n- 0.5 mm tip\n- Rubber comfort grip\n- Quick-drying ink',
    attributes: [['Pens', '10'], ['Tip', '0.5 mm'], ['Ink', 'Gel, quick-drying'], ['Grip', 'Rubber'], ['Pack', 'Reusable case']],
    tags: ['pens', 'stationery', 'school', 'office'],
    flags: {},
    colorways: [
      { name: 'Assorted', family: 'multi', hex: '#3b82f6', primary: '#3b82f6', secondary: '#ef4444', accent: '#22c55e' },
    ],
    stock: [[80]],
    collections: ['under-999', 'everyday-essentials'],
  },
];

const SHOES: ShoeProduct[] = [
  {
    kind: 'shoe',
    variantLabel: 'Size',
    slug: 'velocity-runner-x',
    name: 'Velocity Runner X',
    sku: 'STM-VRX',
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
    kind: 'shoe',
    variantLabel: 'Size',
    slug: 'urban-street-pro',
    name: 'Urban Street Pro',
    sku: 'STM-USP',
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
    kind: 'shoe',
    variantLabel: 'Size',
    slug: 'aeroflex-sport',
    name: 'AeroFlex Sport',
    sku: 'STM-AFS',
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
    kind: 'shoe',
    variantLabel: 'Size',
    slug: 'midnight-leather-classic',
    name: 'Midnight Leather Classic',
    sku: 'STM-MLC',
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
    kind: 'shoe',
    variantLabel: 'Size',
    slug: 'cloudstep-everyday',
    name: 'CloudStep Everyday',
    sku: 'STM-CSE',
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
    kind: 'shoe',
    variantLabel: 'Size',
    slug: 'phantom-high-top',
    name: 'Phantom High-Top',
    sku: 'STM-PHT',
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
    kind: 'shoe',
    variantLabel: 'Size',
    slug: 'trailforce-outdoor',
    name: 'TrailForce Outdoor',
    sku: 'STM-TFO',
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
    kind: 'shoe',
    variantLabel: 'Size',
    slug: 'courtvision-elite',
    name: 'CourtVision Elite',
    sku: 'STM-CVE',
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
    kind: 'shoe',
    variantLabel: 'Size',
    slug: 'coastline-slide',
    name: 'Coastline Slide',
    sku: 'STM-CLS',
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

export const PRODUCTS: SampleProduct[] = [...ITEMS, ...SHOES];

export type PhotoView = 'hero34' | 'side' | 'top' | 'back34';
export const PRODUCT_VIEWS: PhotoView[] = ['hero34', 'side', 'top'];
