// lib/metadataService.ts
import type { Metadata } from 'next';

const RAW_ENV_TOKEN = process.env.TMDB_ACCESS_TOKEN?.trim();
const FALLBACK_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjNjBmMDc1Y2YzNmM2ZGZiMTM2YzNjMGFlNTY0ZDQ2MSIsIm5iZiI6MTc4NjkxNDAzNC4xMjgsInN1YiI6IjZhODIyNGYyMjYxNDgxNDlkZTc2OGM1MiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.h-UBf7qsxc6caT3NTjZ4qBpeOqMhzndlqISR1W_79V8';

const TMDB_ACCESS_TOKEN =
  RAW_ENV_TOKEN && RAW_ENV_TOKEN.split('.').length === 3
    ? RAW_ENV_TOKEN
    : FALLBACK_TOKEN;

const TMDB_BASE = 'https://api.themoviedb.org/3';
const DEFAULT_SITE_TITLE = 'MovieStream — فلك Falak';
const DEFAULT_SITE_DESC =
  'منصة فلك (Falak TV / MovieStream) لمشاهدة وتحميل الأفلام والمسلسلات المترجمة والمدبلجة أونلاين مجاناً بأعلى جودة HD و 4K.';

// Server-side in-memory cache with 1-hour TTL
interface CacheItem {
  data: any;
  expires: number;
}
const serverMediaCache = new Map<string, CacheItem>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export interface TMDBMediaDetails {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  genres?: { id: number; name: string }[];
  tagline?: string;
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  credits?: {
    cast?: { name: string; character: string }[];
    crew?: { name: string; job: string }[];
  };
}

/**
 * Server-side helper to fetch movie/series data directly from TMDB
 * with bilingual fallback (Arabic primary, English fallback).
 */
export async function getTMDBMediaServer(
  type: 'movie' | 'tv',
  id: number | string,
  preferredLang = 'ar-SA'
): Promise<TMDBMediaDetails | null> {
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
  if (!numericId || isNaN(numericId) || numericId <= 0) return null;

  const cacheKey = `${type}_${numericId}_${preferredLang}`;
  const cached = serverMediaCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }

  try {
    const url = `${TMDB_BASE}/${type}/${numericId}?language=${preferredLang}&append_to_response=credits,external_ids`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 3600 }, // Cache on Next.js Data Cache for 1 hour
    });

    if (!res.ok) {
      return null;
    }

    const data: TMDBMediaDetails = await res.json();

    // If Arabic title or overview is blank, fetch English version to fill in blanks
    if (!data.overview || (!data.title && !data.name)) {
      try {
        const enRes = await fetch(
          `${TMDB_BASE}/${type}/${numericId}?language=en-US&append_to_response=credits`,
          {
            headers: { Authorization: `Bearer ${TMDB_ACCESS_TOKEN}` },
            next: { revalidate: 3600 },
          }
        );
        if (enRes.ok) {
          const enData = await enRes.json();
          if (!data.title && !data.name) {
            data.title = enData.title;
            data.name = enData.name;
          }
          if (!data.overview) {
            data.overview = enData.overview;
          }
          if (!data.genres || data.genres.length === 0) {
            data.genres = enData.genres;
          }
        }
      } catch {
        // Ignore fallback failure
      }
    }

    serverMediaCache.set(cacheKey, {
      data,
      expires: Date.now() + CACHE_TTL_MS,
    });

    return data;
  } catch (err) {
    console.error(`[MetadataService] Failed to fetch TMDB ${type}/${numericId}:`, err);
    return null;
  }
}

/**
 * Builds the canonical site base URL.
 */
export function getCanonicalBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  }
  return 'https://falak.tv';
}

/**
 * Generates rich Next.js Metadata for OpenGraph, Twitter, and Search Indexing.
 */
export async function generateMediaMetadata({
  type,
  id,
  season,
  episode,
  baseUrl,
}: {
  type: 'movie' | 'tv';
  id: number | string;
  season?: number;
  episode?: number;
  baseUrl?: string;
}): Promise<Metadata> {
  const details = await getTMDBMediaServer(type, id);
  const siteUrl = baseUrl || getCanonicalBaseUrl();

  if (!details) {
    return {
      title: DEFAULT_SITE_TITLE,
      description: DEFAULT_SITE_DESC,
      openGraph: {
        title: DEFAULT_SITE_TITLE,
        description: DEFAULT_SITE_DESC,
        url: siteUrl,
      },
    };
  }

  const isTv = type === 'tv';
  const rawTitle = details.title || details.name || details.original_title || details.original_name || '';
  const originalTitle = details.original_title || details.original_name || '';
  const dateStr = details.release_date || details.first_air_date || '';
  const releaseYear = dateStr ? dateStr.substring(0, 4) : '';
  const genresList = (details.genres || []).map((g) => g.name).slice(0, 3).join('، ');
  const rating = details.vote_average ? Number(details.vote_average).toFixed(1) : null;

  // Build high-impact SEO title
  let seoTitle = '';
  if (isTv) {
    const seasonText = season ? `الموسم ${season}` : '';
    const episodeText = episode ? `الحلقة ${episode}` : '';
    const episodeSegment = [seasonText, episodeText].filter(Boolean).join(' ');
    seoTitle = `مسلسل ${rawTitle} ${episodeSegment ? `(${episodeSegment})` : ''} مترجم كامل HD — فلك Falak`;
  } else {
    seoTitle = `فيلم ${rawTitle} ${releaseYear ? `(${releaseYear})` : ''} مترجم كامل أونلاين 4K/HD — فلك Falak`;
  }

  // Build descriptive meta summary (between 120 and 160 characters)
  let cleanOverview = (details.overview || '').trim().replace(/\s+/g, ' ');
  if (cleanOverview.length > 150) {
    cleanOverview = `${cleanOverview.substring(0, 147)}...`;
  }
  const seoDescription = cleanOverview
    ? `${isTv ? 'مسلسل' : 'فيلم'} ${rawTitle}: ${cleanOverview} ${rating ? `| تقييم: ${rating}★` : ''}`
    : `مشاهدة وتحميل ${isTv ? 'مسلسل' : 'فيلم'} ${rawTitle} أونلاين بجودة عالية 4K/HD مترجم حصرياً على فلك Falak.${genresList ? ` تصنيف: ${genresList}.` : ''}`;

  // Build canonical URL
  const queryParts = [`type=${type}`, `id=${id}`];
  if (rawTitle) {
    const slug = encodeURIComponent(
      rawTitle
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-\u0600-\u06FF]/g, '')
    );
    if (slug) queryParts.push(`title=${slug}`);
  }
  if (isTv && season && episode) {
    queryParts.push(`s=${season}`, `e=${episode}`);
  }
  const canonicalUrl = `${siteUrl}?${queryParts.join('&')}`;

  // Image assets
  const posterUrl = details.poster_path
    ? `https://image.tmdb.org/t/p/w780${details.poster_path}`
    : details.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}`
    : `${siteUrl}/apple-touch-icon.png`;

  const backdropUrl = details.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}`
    : posterUrl;

  // Cast keywords
  const topCast = (details.credits?.cast || []).slice(0, 4).map((c) => c.name);
  const keywords = [
    rawTitle,
    originalTitle,
    isTv ? 'مسلسلات مترجمة' : 'أفلام مترجمة',
    isTv ? 'مشاهدة مسلسل' : 'مشاهدة فيلم',
    'فلك TV',
    'Falak',
    'MovieStream',
    releaseYear,
    ...(details.genres || []).map((g) => g.name),
    ...topCast,
  ].filter(Boolean);

  return {
    title: seoTitle,
    description: seoDescription,
    keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${rawTitle} ${releaseYear ? `(${releaseYear})` : ''} — مشاهدة أونلاين | فلك`,
      description: seoDescription,
      url: canonicalUrl,
      siteName: DEFAULT_SITE_TITLE,
      locale: 'ar_SA',
      alternateLocale: ['en_US'],
      type: isTv ? 'video.tv_show' : 'video.movie',
      images: [
        {
          url: backdropUrl,
          width: 1280,
          height: 720,
          alt: `${rawTitle} — لقطة شاشة وخلفية بدقة عالية`,
        },
        {
          url: posterUrl,
          width: 780,
          height: 1170,
          alt: `بوستر ${rawTitle}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${rawTitle} ${releaseYear ? `(${releaseYear})` : ''} — فلك Falak`,
      description: seoDescription,
      images: [backdropUrl],
      creator: '@MovieStream',
      site: '@MovieStream',
    },
  };
}

/**
 * Builds Schema.org JSON-LD structured data for Google Rich Snippets (Movie or TVSeries).
 */
export function buildMediaJsonLd(
  details: TMDBMediaDetails,
  type: 'movie' | 'tv',
  canonicalUrl: string,
  season = 1,
  episode = 1
): Record<string, any> {
  const isTv = type === 'tv';
  const rawTitle = details.title || details.name || details.original_title || details.original_name || '';
  const dateStr = details.release_date || details.first_air_date || '';
  const posterUrl = details.poster_path
    ? `https://image.tmdb.org/t/p/w780${details.poster_path}`
    : undefined;
  const backdropUrl = details.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}`
    : undefined;

  const directors = (details.credits?.crew || [])
    .filter((c) => c.job === 'Director')
    .map((d) => ({
      '@type': 'Person',
      name: d.name,
    }));

  const actors = (details.credits?.cast || []).slice(0, 6).map((c) => ({
    '@type': 'Person',
    name: c.name,
  }));

  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': isTv ? 'TVSeries' : 'Movie',
    name: rawTitle,
    alternateName: details.original_title || details.original_name || undefined,
    description: details.overview || '',
    url: canonicalUrl,
    inLanguage: ['ar', 'en'],
    genre: (details.genres || []).map((g) => g.name),
  };

  const images = [backdropUrl, posterUrl].filter(Boolean);
  if (images.length > 0) {
    jsonLd.image = images;
  }

  if (dateStr) {
    jsonLd.datePublished = dateStr;
  }

  if (details.vote_average && details.vote_average > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(details.vote_average).toFixed(1),
      bestRating: '10',
      worstRating: '1',
      ratingCount: details.vote_count || 50,
    };
  }

  if (directors.length > 0) {
    jsonLd.director = directors;
  }

  if (actors.length > 0) {
    jsonLd.actor = actors;
  }

  jsonLd.potentialAction = {
    '@type': 'WatchAction',
    target: canonicalUrl,
  };

  return jsonLd;
}
