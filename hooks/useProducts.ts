'use client';

import { useEffect, useState } from 'react';
import type { Product, Category } from '@/lib/db/schema';

interface ProductListResponse {
  data: {
    items: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null;
  error: string | null;
}

export function useProducts(categorySlug?: string | null, page = 1, limit = 12) {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (categorySlug) qs.set('category', categorySlug);
        qs.set('page', String(page));
        qs.set('limit', String(limit));
        const res = await fetch(`/api/products?${qs}`);
        const json = (await res.json()) as ProductListResponse;
        if (cancelled) return;
        if (json.error || !json.data) throw new Error(json.error ?? 'unknown');
        setItems(json.data.items);
        setTotal(json.data.total);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [categorySlug, page, limit]);

  return { items, total, loading, error };
}

export function useCategories(isFurniture?: boolean) {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (typeof isFurniture === 'boolean')
          qs.set('isFurniture', String(isFurniture));
        const res = await fetch(`/api/categories?${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setItems(json.data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [isFurniture]);

  return { items, loading, error };
}
