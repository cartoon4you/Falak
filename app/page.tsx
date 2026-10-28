// app/page.tsx
import type { Metadata } from 'next';
import FalakClientPage from '@/components/FalakClientPage';
import {
  generateMediaMetadata,
  getTMDBMediaServer,
  buildMediaJsonLd,
  getCanonicalBaseUrl,
} from '@/lib/metadataService';

interface PageProps {
  searchParams: Promise<{
    type?: string;
    id?: string;
    title?: string;
    s?: string;
    e?: string;
    tab?: string;
  }>;
}

/**
 * Next.js dynamic metadata generator for searchParams (?type=movie&id=603)
 * Fetches titles, descriptions, and poster URLs from TMDB server-side
 * for proper social sharing (WhatsApp, Telegram, Facebook, Twitter) and Google indexing.
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const rawType = (params.type || '').trim().toLowerCase();
  const rawId = (params.id || '').trim();

  if ((rawType === 'movie' || rawType === 'tv') && rawId) {
    const season = params.s ? parseInt(params.s, 10) : undefined;
    const episode = params.e ? parseInt(params.e, 10) : undefined;

    return generateMediaMetadata({
      type: rawType as 'movie' | 'tv',
      id: rawId,
      season,
      episode,
    });
  }

  // Default site metadata
  return {
    title: 'MovieStream — فلك Falak',
    description: 'Streaming platform for movies and series with auto Arabic subtitles.',
    openGraph: {
      title: 'MovieStream — فلك Falak',
      description: 'Streaming platform for movies and series with auto Arabic subtitles.',
      url: getCanonicalBaseUrl(),
      siteName: 'MovieStream — فلك Falak',
      locale: 'ar_SA',
      type: 'website',
      images: [
        {
          url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1920&auto=format&fit=crop',
          width: 1920,
          height: 1080,
          alt: 'MovieStream فلك',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'MovieStream — فلك Falak',
      description: 'Streaming platform for movies and series with auto Arabic subtitles.',
      images: [
        'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1920&auto=format&fit=crop',
      ],
    },
  };
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const rawType = (resolvedParams.type || '').trim().toLowerCase();
  const rawId = (resolvedParams.id || '').trim();

  // If a specific media item is targeted in searchParams, fetch details to inject JSON-LD server-side
  let jsonLd: Record<string, any> | null = null;
  if ((rawType === 'movie' || rawType === 'tv') && rawId) {
    const details = await getTMDBMediaServer(rawType as 'movie' | 'tv', rawId);
    if (details) {
      const siteUrl = getCanonicalBaseUrl();
      const season = resolvedParams.s ? parseInt(resolvedParams.s, 10) : 1;
      const episode = resolvedParams.e ? parseInt(resolvedParams.e, 10) : 1;
      const canonical = `${siteUrl}?type=${rawType}&id=${rawId}${resolvedParams.title ? `&title=${resolvedParams.title}` : ''}`;
      jsonLd = buildMediaJsonLd(details, rawType as 'movie' | 'tv', canonical, season, episode);
    }
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <FalakClientPage initialSearchParams={resolvedParams} />
    </>
  );
}
