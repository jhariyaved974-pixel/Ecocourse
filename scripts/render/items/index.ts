import type { ItemModel } from '../catalog';
import type { Builder } from './kit';
import { BUILDERS as techToys } from './tech-toys';
import { BUILDERS as homeBeauty } from './home-beauty';
import { BUILDERS as styleSport } from './style-sport';

export const ITEM_BUILDERS: Record<ItemModel, Builder> = { ...techToys, ...homeBeauty, ...styleSport };
