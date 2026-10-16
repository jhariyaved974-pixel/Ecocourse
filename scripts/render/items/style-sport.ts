// Procedural models: tshirt, backpack, sunglasses, wallet, yogamat, dumbbells, notebooks, pens.
// See kit.ts for conventions (metres, grounded, +z front).
import { placeholder, type Builder } from './kit';

export const BUILDERS = {
  tshirt: ((c) => placeholder(c)) as Builder,
  backpack: ((c) => placeholder(c)) as Builder,
  sunglasses: ((c) => placeholder(c)) as Builder,
  wallet: ((c) => placeholder(c)) as Builder,
  yogamat: ((c) => placeholder(c)) as Builder,
  dumbbells: ((c) => placeholder(c)) as Builder,
  notebooks: ((c) => placeholder(c)) as Builder,
  pens: ((c) => placeholder(c)) as Builder,
};
