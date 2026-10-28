import { NextResponse } from 'next/server';

const RAW_ENV_TOKEN = process.env.TMDB_ACCESS_TOKEN?.trim();
const TMDB_ACCESS_TOKEN =
  RAW_ENV_TOKEN && RAW_ENV_TOKEN.split('.').length === 3
    ? RAW_ENV_TOKEN
    : 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjNjBmMDc1Y2YzNmM2ZGZiMTM2YzNjMGFlNTY0ZDQ2MSIsIm5iZiI6MTc4NjkxNDAzNC4xMjgsInN1YiI6IjZhODIyNGYyMjYxNDgxNDlkZTc2OGM1MiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.h-UBf7qsxc6caT3NTjZ4qBpeOqMhzndlqISR1W_79V8';
const TMDB_BASE = 'https://api.themoviedb.org/3';

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get('language') || 'ar-SA';
  
  const url = new URL(`${TMDB_BASE}/${path}`);
  url.searchParams.set('include_adult', 'false');
  searchParams.forEach((value, key) => url.searchParams.set(key, value));
  
  const response = await fetch(url.toString(), {
    headers: { 
        Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    },
  });
  
  if (!response.ok) {
    return NextResponse.json({ error: 'TMDB API error' }, { status: response.status });
  }
  
  const data = await response.json();
  return NextResponse.json(data);
}
