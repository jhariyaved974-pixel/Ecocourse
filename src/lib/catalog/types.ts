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
  category: { id: string; name: string; slug: string } | null;
  brand: { name: string; slug: string } | null;
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
  inStock?: boolean;
  sale?: boolean;
  flag?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
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
