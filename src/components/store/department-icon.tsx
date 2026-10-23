import { Layers, Shirt, ShoppingBag, type LucideProps } from 'lucide-react';

// Icons for the sample departments; any other department gets a shopping bag.
const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  saris: Layers,
  blouses: Shirt,
};

export function DepartmentIcon({ slug, ...props }: LucideProps & { slug: string }) {
  const Icon = ICONS[slug] ?? ShoppingBag;
  return <Icon aria-hidden {...props} />;
}
