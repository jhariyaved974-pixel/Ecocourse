import type { Enums } from '@/lib/database.types';

export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  price: number;
  finalPrice: number;
  categoryName: string | null;
  categorySlug: string | null;
  isNew: boolean;
  isBestseller: boolean;
  isTrending: boolean;
  isFeatured: boolean;
  ratingAvg: number;
  ratingCount: number;
  image: string | null;
  hoverImage: string | null;
  colors: { name: string; hex: string }[];
  inStock: boolean;
}

export interface ProductVariantData {
  id: string;
  colorId: string | null;
  sizeLabel: string;
  sizeSort: number;
  sku: string;
  available: number;
}

export interface ProductMediaData {
  id: string;
  kind: Enums<'media_kind'>;
  url: string;
  posterUrl: string | null;
  alt: string;
  colorId: string | null;
  isCover: boolean;
  width: number | null;
  height: number | null;
}

export interface ProductDetailData {
  id: string;
  name: string;
  slug: string;
  sku: string;
  gender: Enums<'gender_target'>;
  shortDescription: string;
  description: string;
  price: number;
  finalPrice: number;
  saleEndsAt: string | null;
  tags: string[];
  isNew: boolean;
  isBestseller: boolean;
  ratingAvg: number;
  ratingCount: number;
  /** Leaf category, with its department when it is a sub-category. */
  category: { id: string; name: string; slug: string; parent: { name: string; slug: string } | null } | null;
  brand: { name: string; slug: string } | null;
  /** Name of the option shoppers pick ("Size", "Strap size", "Weight" ...). */
  variantLabel: string;
  colors: { id: string; name: string; hex: string }[];
  variants: ProductVariantData[];
  media: ProductMediaData[];
  attributes: { label: string; value: string }[];
  modelUrl: string | null;
  sizeGuideId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImage: string | null;
  updatedAt: string;
  publishedAt: string | null;
  status: Enums<'product_status'>;
}

export interface SearchParamsInput {
  q?: string;
  category?: string;
  collection?: string;
  gender?: string;
  sizes?: string[];
  colors?: string[];
  min?: number;
  max?: number;
  brands?: string[];
  rating?: number;
  inStock?: boolean;
  sale?: boolean;
  flag?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  image: string | null;
  imageAlt: string;
}

/** A department (top-level category) with its sub-categories. */
export interface Department extends CategoryNode {
  children: CategoryNode[];
}

export interface CatalogFacets {
  /** Option values in natural order, without 'Standard'. */
  sizes: string[];
  /** Distinct variant labels of products in scope that have options. */
  variantLabels: string[];
  colors: string[];
  genders: string[];
  brands: { slug: string; name: string }[];
  /** Direct product counts per category in scope. */
  categories: { slug: string; name: string; parentSlug: string | null; productCount: number }[];
  priceMin: number;
  priceMax: number;
}

export interface SizeGuideData {
  id: string;
  name: string;
  intro: string;
  notes: string;
  /** Header labels; the first column labels each row. */
  columns: string[];
  rows: { cells: string[] }[];
}

export interface SearchResult {
  items: ProductCardData[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReviewData {
  id: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
  productName?: string;
  productSlug?: string;
}
