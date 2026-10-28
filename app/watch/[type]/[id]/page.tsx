// app/watch/[type]/[id]/page.tsx
import type { Metadata } from 'next';
import FalakClientPage from '@/components/FalakClientPage';
import {
  generateMediaMetadata,
  getTMDBMediaServer,
  buildMediaJsonLd,
  getCanonicalBaseUrl,
} from '@/lib/metadataService';

interface WatchPageProps {
  params: Promise<{
    type: string;
    id: string;
  }>;
  searchParams: Promise<{
    title?: string;
    s?: string;
    e?: string;
  }>;
}

/**
 * Dynamic metadata generator for dedicated watch routes (/watch/movie/603, /watch/tv/1399)
 * Fetches titles, descriptions, and high-res poster URLs from TMDB server-side
 * for Google Rich Snippets and social sharing.
 */
export async function generateMetadata({
  params,
  searchParams,
}: WatchPageProps): Promise<Metadata> {
  const { type, id } = await params;
  const { s, e } = await searchParams;

  const cleanType = type.toLowerCase() === 'tv' ? 'tv' : 'movie';
  const season = s ? parseInt(s, 10) : undefined;
  const episode = e ? parseInt(e, 10) : undefined;

  return generateMediaMetadata({
    type: cleanType,
    id,
    season,
    episode,
  });
}

export default async function WatchPage({ params, searchParams }: WatchPageProps) {
  const { type, id } = await params;
  const { title, s, e } = await searchParams;

  const cleanType = type.toLowerCase() === 'tv' ? 'tv' : 'movie';
  const season = s ? parseInt(s, 10) : 1;
  const episode = e ? parseInt(e, 10) : 1;

  // Fetch media details to inject Schema.org JSON-LD structured data into the HTML head
  const details = await getTMDBMediaServer(cleanType, id);
  let jsonLd: Record<string, any> | null = null;
  if (details) {
    const siteUrl = getCanonicalBaseUrl();
    const canonical = `${siteUrl}/watch/${cleanType}/${id}${s && e ? `?s=${s}&e=${e}` : ''}`;
    jsonLd = buildMediaJsonLd(details, cleanType, canonical, season, episode);
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <FalakClientPage
        initialSearchParams={{
          type: cleanType,
          id,
          title,
          s,
          e,
        }}
      />
    </>
  );
}
