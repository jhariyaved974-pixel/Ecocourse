// Procedural models: earbuds, headphones, smartwatch, powerbank, speaker, lantern, blocks, plush.
// See kit.ts for conventions (metres, grounded, +z front).
import { placeholder, type Builder } from './kit';

export const BUILDERS = {
  earbuds: ((c) => placeholder(c)) as Builder,
  headphones: ((c) => placeholder(c)) as Builder,
  smartwatch: ((c) => placeholder(c)) as Builder,
  powerbank: ((c) => placeholder(c)) as Builder,
  speaker: ((c) => placeholder(c)) as Builder,
  lantern: ((c) => placeholder(c)) as Builder,
  blocks: ((c) => placeholder(c)) as Builder,
  plush: ((c) => placeholder(c)) as Builder,
};
