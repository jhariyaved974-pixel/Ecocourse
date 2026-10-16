import { CookingPot, Dumbbell, Footprints, Headphones, NotebookPen, Shirt, ShoppingBag, Sparkles, ToyBrick, type LucideProps } from 'lucide-react';

// Icons for the sample departments; any other department gets a shopping bag.
const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  electronics: Headphones,
  fashion: Shirt,
  footwear: Footprints,
  'home-kitchen': CookingPot,
  beauty: Sparkles,
  'sports-fitness': Dumbbell,
  'toys-kids': ToyBrick,
  'books-stationery': NotebookPen,
};

export function DepartmentIcon({ slug, ...props }: LucideProps & { slug: string }) {
  const Icon = ICONS[slug] ?? ShoppingBag;
  return <Icon aria-hidden {...props} />;
}
