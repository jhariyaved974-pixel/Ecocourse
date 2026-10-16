// Procedural models: bottle, mugs, frypan, lamp, planters, serum, lotion, bodywash.
// See kit.ts for conventions (metres, grounded, +z front).
import { placeholder, type Builder } from './kit';

export const BUILDERS = {
  bottle: ((c) => placeholder(c)) as Builder,
  mugs: ((c) => placeholder(c)) as Builder,
  frypan: ((c) => placeholder(c)) as Builder,
  lamp: ((c) => placeholder(c)) as Builder,
  planters: ((c) => placeholder(c)) as Builder,
  serum: ((c) => placeholder(c)) as Builder,
  lotion: ((c) => placeholder(c)) as Builder,
  bodywash: ((c) => placeholder(c)) as Builder,
};
