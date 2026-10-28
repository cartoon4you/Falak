// components/FalakClientPage.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileNav from '@/components/MobileNav';
import GenreChips from '@/components/GenreChips';
import DetailPanel from '@/components/DetailPanel';
import Player from '@/components/Player';
import MediaCard from '@/components/MediaCard';
import UnauthorizedDomainModal from '@/components/UnauthorizedDomainModal';
import { fetchTMDB } from '@/lib/tmdb';
import { auth, googleProvider, db } from '@/lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { Play, Bookmark, Search as SearchIcon, Film, Trash2, ArrowLeft, X, Tv } from 'lucide-react';
import { MediaItem, LangCode, ContinueWatchingItem } from '@/types';
import { T, LANGUAGES } from '@/lib/i18n';
import {
  buildPermalink,
  parsePermalink,
  updateMediaMetadata,
  resetMediaMetadata,
} from '@/lib/permalink';

const LOCAL_FAVORITES_KEY = 'falak_favorites_guest';
const LOCAL_CONTINUE_WATCHING_KEY = 'falak_continue_watching';

export interface FalakClientPageProps {
  initialSearchParams?: {
    type?: string;
    id?: string;
    title?: string;
    s?: string;
    e?: string;
    tab?: string;
  };
}

export default function FalakClientPage({ initialSearchParams }: FalakClientPageProps) {
  // Language & Localization State (SSR-safe default 'ar')
  const [lang, setLang] = useState<LangCode>('ar');
  const t = T[lang] || T.ar;
  const tmdbLang = LANGUAGES.find((l) => l.code === lang)?.tmdb || 'ar-SA';

  // Navigation & UI State (pure SSR-safe defaults to prevent hydration mismatch)
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'favorites'>('home');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreLogic, setGenreLogic] = useState<'or' | 'and'>('or');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);

  // Player & Detail Modal State
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [currentSeason, setCurrentSeason] = useState(1);
  const [currentEpisode, setCurrentEpisode] = useState(1);

  // Permalink & Loading Feedback State
  const [isInitialPermalinkLoading, setIsInitialPermalinkLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);

  const selectedMediaRef = useRef<any>(selectedMedia);
  useEffect(() => {
    selectedMediaRef.current = selectedMedia;
  }, [selectedMedia]);

  const showAppToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Auth & Favorites State (favorites restored from localStorage inside useEffect)
  const [user, setUser] = useState<User | null>(null);
  const [favorites, setFavorites] = useState<MediaItem[]>([]);

  // Smooth Tab Switching
  const handleTabChange = useCallback((tab: 'home' | 'search' | 'favorites') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (tab === 'search') {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    }
  }, []);

  // Listen for Firebase auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const snapshot = await getDocs(collection(db, 'users', currentUser.uid, 'favorites'));
          const cloudFavs: MediaItem[] = [];
          snapshot.forEach((docSnap) => {
            cloudFavs.push(docSnap.data() as MediaItem);
          });
          if (cloudFavs.length > 0) {
            setFavorites((prev) => {
              const merged = [...cloudFavs];
              prev.forEach((p) => {
                if (!merged.some((m) => m.id === p.id)) {
                  merged.push(p);
                }
              });
              localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(merged));
              return merged;
            });
          }
        } catch (e) {
          console.warn('Failed to fetch user favorites from cloud:', e);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync favorites helper
  const syncFavoritesStorage = (updated: MediaItem[]) => {
    setFavorites(updated);
    try {
      localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(updated));
    } catch {}
  };

  // Toggle Favorite
  const toggleFavorite = async (item: any) => {
    const isFav = favorites.some((f) => f.id === item.id);
    const mediaItem: MediaItem = {
      id: item.id,
      mediaType: item.mediaType || item.media_type || 'movie',
      title: item.title || item.name || '',
      poster_path: item.poster_path || '',
      vote_average: item.vote_average || 0,
      release_date: item.release_date || item.first_air_date || '',
    };

    let updatedList: MediaItem[];
    if (isFav) {
      updatedList = favorites.filter((f) => f.id !== item.id);
      if (user) {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'favorites', `${mediaItem.mediaType}_${item.id}`));
        } catch {}
      }
    } else {
      updatedList = [mediaItem, ...favorites];
      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid, 'favorites', `${mediaItem.mediaType}_${item.id}`), mediaItem);
        } catch {}
      }
    }
    syncFavoritesStorage(updatedList);
  };

  // Continue Watching Logic
  const updateContinueWatching = useCallback((item: any, season?: number, episode?: number) => {
    setContinueWatching((prev) => {
      const newItem: ContinueWatchingItem = {
        id: item.id,
        mediaType: (item.mediaType || item.media_type || 'movie') as any,
        title: item.title || item.name || '',
        poster_path: item.poster_path || '',
        season,
        episode,
        lastUpdated: Date.now(),
      };

      const filtered = prev.filter((i) => i.id !== item.id);
      const updated = [newItem, ...filtered].slice(0, 12); // Keep last 12 items
      localStorage.setItem(LOCAL_CONTINUE_WATCHING_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeFromHistory = (id: number) => {
    setContinueWatching((prev) => {
      const updated = prev.filter((i) => i.id !== id);
      localStorage.setItem(LOCAL_CONTINUE_WATCHING_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Google Sign-in Handler
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error?.code === 'auth/unauthorized-domain') {
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
        setUnauthorizedDomain(currentHost || 'ais-dev-...run.app');
      } else if (error?.code === 'auth/popup-blocked') {
        showAppToast(lang === 'ar' ? 'تم حظر النافذة المنبثقة، يرجى السماح بالنوافذ لتسجيل الدخول' : 'Popup blocked, please allow popups to sign in');
      } else if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        console.warn('Login warning:', error?.message || error);
        showAppToast(lang === 'ar' ? 'تعذر تسجيل الدخول، يرجى المحاولة لاحقاً' : 'Login failed, please try again');
      }
    }
  };

  // Logout Handler
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Handle display language change with local persistence and direction update
  const handleLanguageChange = (newLang: LangCode) => {
    setLang(newLang);
    try {
      localStorage.setItem('falak_lang', newLang);
    } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLang;
      const found = LANGUAGES.find((l) => l.code === newLang);
      document.documentElement.dir = found?.dir || (newLang === 'ar' ? 'rtl' : 'ltr');
    }
    const tNew = T[newLang] || T.ar;
    showAppToast(tNew.toast_lang_changed || '🌐 Language changed');
  };

  // Multi-genre filter handlers
  const handleToggleGenre = (genreId: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]
    );
  };

  const handleClearGenres = () => {
    setSelectedGenres([]);
  };

  // Fetch movies when selected genres, logic mode, or language changes or on initial mount
  useEffect(() => {
    let isCancelled = false;

    async function loadMovies() {
      setLoading(true);
      try {
        let endpoint = '/movie/popular';
        if (selectedGenres.length > 0) {
          const separator = genreLogic === 'and' ? ',' : '|';
          const genreParam = selectedGenres.join(separator);
          endpoint = `/discover/movie?with_genres=${genreParam}&sort_by=popularity.desc`;
        }
        const data = await fetchTMDB(endpoint, { lang: tmdbLang });
        if (!isCancelled) {
          setMedia(data.results || []);
        }
      } catch (error) {
        console.error('Error fetching movies:', error);
        if (!isCancelled) {
          setMedia([]);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadMovies();
    return () => {
      isCancelled = true;
    };
  }, [selectedGenres, genreLogic, tmdbLang]);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
    }
  };

  // Live search debounce handler with localized TMDB results
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setSearchOpen(true);
      try {
        const data = await fetchTMDB(
          `/search/multi?query=${encodeURIComponent(searchQuery.trim())}`,
          { lang: tmdbLang }
        );
        const filtered = (data.results || []).filter(
          (item: any) => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
        );
        setSearchResults(filtered);
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setSearchLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, tmdbLang]);

  // 1. Initial mount: safely restore client-side state
  useEffect(() => {
    // 1a. Restore language preference from local storage
    try {
      const storedLang = localStorage.getItem('falak_lang') as LangCode;
      if (storedLang && ['ar', 'en', 'fr', 'es', 'tr'].includes(storedLang)) {
        queueMicrotask(() => {
          setLang(storedLang);
          document.documentElement.lang = storedLang;
          const found = LANGUAGES.find((l) => l.code === storedLang);
          document.documentElement.dir = found?.dir || (storedLang === 'ar' ? 'rtl' : 'ltr');
        });
      }
    } catch (e) {
      console.warn('Could not read stored language:', e);
    }

    // 1b. Restore favorites from local storage
    try {
      const stored = localStorage.getItem(LOCAL_FAVORITES_KEY);
      if (stored) {
        const parsedFavs = JSON.parse(stored);
        if (Array.isArray(parsedFavs)) {
          queueMicrotask(() => {
            setFavorites(parsedFavs);
          });
        }
      }
    } catch (e) {
      console.warn('Could not read guest favorites:', e);
    }

    // 1c. Parse search query parameters
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const params = new URLSearchParams(search);
    const tabParam = initialSearchParams?.tab || params.get('tab');
    if (tabParam === 'search' || tabParam === 'favorites') {
      queueMicrotask(() => {
        setActiveTab(tabParam);
      });
    }

    // 1d. Restore continue watching from local storage
    try {
      const stored = localStorage.getItem(LOCAL_CONTINUE_WATCHING_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          queueMicrotask(() => {
            setContinueWatching(parsed);
          });
        }
      }
    } catch (e) {
      console.warn('Could not read continue watching history:', e);
    }

    // 1e. Parse permalink (from URL or initialSearchParams)
    const targetType = initialSearchParams?.type || params.get('type');
    const targetId = initialSearchParams?.id || params.get('id');
    const parsed = parsePermalink(search) || (targetType && targetId ? {
      isValid: true,
      type: targetType as 'movie' | 'tv',
      id: parseInt(targetId, 10),
      season: initialSearchParams?.s ? parseInt(initialSearchParams.s, 10) : 1,
      episode: initialSearchParams?.e ? parseInt(initialSearchParams.e, 10) : 1,
      hasEpisodeParams: Boolean(initialSearchParams?.s || initialSearchParams?.e),
    } : null);

    if (parsed && parsed.isValid && !isNaN(parsed.id)) {
      queueMicrotask(() => {
        setIsInitialPermalinkLoading(true);
      });
      fetchTMDB(`/${parsed.type}/${parsed.id}?append_to_response=credits,videos,external_ids`)
        .then((details) => {
          const fullItem = { ...details, mediaType: parsed.type };
          setSelectedMedia(fullItem);
          setCurrentSeason(parsed.season);
          setCurrentEpisode(parsed.episode);
          setShowPlayer(false);
          updateMediaMetadata(fullItem, parsed.season, parsed.episode);
        })
        .catch((err) => {
          console.warn('Permalink item not found:', err);
          showAppToast('العنصر المطلوب غير موجود');
          resetMediaMetadata();
          if (typeof window !== 'undefined') {
            const pathname = window.location.pathname || '/';
            const cleanUrl = tabParam && tabParam !== 'home' ? `${pathname}?tab=${tabParam}` : pathname;
            window.history.replaceState({ tab: tabParam || 'home' }, '', cleanUrl);
          }
        })
        .finally(() => {
          setIsInitialPermalinkLoading(false);
        });
    }
  }, [initialSearchParams]);

  // 2. Browser history navigation (Back / Forward) popstate listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = async () => {
      const search = window.location.search;
      const parsed = parsePermalink(search);
      const params = new URLSearchParams(search);
      const tabParam = params.get('tab');

      if (tabParam === 'search' || tabParam === 'favorites' || tabParam === 'home') {
        setActiveTab(tabParam);
      }

      if (parsed && parsed.isValid) {
        setCurrentSeason(parsed.season);
        setCurrentEpisode(parsed.episode);

        const current = selectedMediaRef.current;
        if (
          current &&
          current.id === parsed.id &&
          (current.mediaType === parsed.type || current.media_type === parsed.type)
        ) {
          setShowPlayer(false);
          updateMediaMetadata(current, parsed.season, parsed.episode);
        } else {
          try {
            const details = await fetchTMDB(
              `/${parsed.type}/${parsed.id}?append_to_response=credits,videos,external_ids`
            );
            const fullItem = { ...details, mediaType: parsed.type };
            setSelectedMedia(fullItem);
            setShowPlayer(false);
            updateMediaMetadata(fullItem, parsed.season, parsed.episode);
          } catch {
            setSelectedMedia(null);
            setShowPlayer(false);
            resetMediaMetadata();
          }
        }
      } else {
        setSelectedMedia(null);
        setShowPlayer(false);
        resetMediaMetadata();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Open detail panel for movie/show with permalink pushState
  const handleOpenDetail = async (
    id: number,
    type?: 'movie' | 'tv' | string,
    initialTitle?: string,
    initialSeason = 1,
    initialEpisode = 1
  ) => {
    const resolvedType = String(type).toLowerCase() === 'tv' ? 'tv' : 'movie';

    let startS = initialSeason;
    let startE = initialEpisode;
    if (initialSeason === 1 && initialEpisode === 1) {
      const saved = continueWatching.find((i) => i.id === id);
      if (saved) {
        startS = saved.season || 1;
        startE = saved.episode || 1;
      }
    }

    const preliminaryUrl = buildPermalink({
      type: resolvedType,
      id,
      title: initialTitle,
      season: resolvedType === 'tv' ? startS : undefined,
      episode: resolvedType === 'tv' ? startE : undefined,
    });
    window.history.pushState(
      { type: resolvedType, id, season: startS, episode: startE, tab: activeTab },
      '',
      preliminaryUrl
    );

    try {
      const details = await fetchTMDB(`/${resolvedType}/${id}?append_to_response=credits,videos,external_ids`);
      const fullItem = { ...details, mediaType: resolvedType };
      setSelectedMedia(fullItem);
      setCurrentSeason(startS);
      setCurrentEpisode(startE);
      setShowPlayer(false);

      const finalUrl = buildPermalink({
        type: resolvedType,
        id,
        title: fullItem.title || fullItem.name || initialTitle,
        season: resolvedType === 'tv' ? startS : undefined,
        episode: resolvedType === 'tv' ? startE : undefined,
      });
      window.history.replaceState(
        { type: resolvedType, id, season: startS, episode: startE, tab: activeTab },
        '',
        finalUrl
      );
      updateMediaMetadata(fullItem, startS, startE);
    } catch {
      const fallbackItem = { id, mediaType: resolvedType, title: initialTitle };
      setSelectedMedia(fallbackItem);
      setCurrentSeason(startS);
      setCurrentEpisode(startE);
      setShowPlayer(false);
      updateMediaMetadata(fallbackItem, startS, startE);
    }
  };

  // Directly start player for movie/show with permalink pushState
  const handleQuickPlay = async (item: any) => {
    const isTv = item.mediaType === 'tv' || item.media_type === 'tv';
    const resolvedType = isTv ? 'tv' : 'movie';
    const initialTitle = item.title || item.name;

    const permalink = buildPermalink({
      type: resolvedType,
      id: item.id,
      title: initialTitle,
      season: resolvedType === 'tv' ? 1 : undefined,
      episode: resolvedType === 'tv' ? 1 : undefined,
    });
    window.history.pushState(
      { type: resolvedType, id: item.id, season: 1, episode: 1, tab: activeTab },
      '',
      permalink
    );

    try {
      const details = await fetchTMDB(`/${resolvedType}/${item.id}?append_to_response=credits,videos,external_ids`);
      const fullItem = { ...details, mediaType: resolvedType };
      setSelectedMedia(fullItem);

      const saved = continueWatching.find((i) => i.id === item.id);
      const startS = saved?.season || 1;
      const startE = saved?.episode || 1;

      setCurrentSeason(startS);
      setCurrentEpisode(startE);
      setShowPlayer(true);
      updateMediaMetadata(fullItem, startS, startE);
      updateContinueWatching(fullItem, startS, startE);
    } catch {
      const fallbackItem = { ...item, mediaType: resolvedType };
      setSelectedMedia(fallbackItem);

      const saved = continueWatching.find((i) => i.id === item.id);
      const startS = saved?.season || 1;
      const startE = saved?.episode || 1;

      setCurrentSeason(startS);
      setCurrentEpisode(startE);
      setShowPlayer(true);
      updateMediaMetadata(fallbackItem, startS, startE);
      updateContinueWatching(fallbackItem, startS, startE);
    }
  };

  // Change TV season or episode using replaceState
  const handleSelectEpisode = (season: number, episode: number) => {
    setCurrentSeason(season);
    setCurrentEpisode(episode);
    if (selectedMedia) {
      const isTv = selectedMedia.mediaType === 'tv' || selectedMedia.media_type === 'tv';
      if (isTv) {
        const updatedPermalink = buildPermalink({
          type: 'tv',
          id: selectedMedia.id,
          title: selectedMedia.title || selectedMedia.name,
          season,
          episode,
        });
        window.history.replaceState(
          { ...window.history.state, season, episode },
          '',
          updatedPermalink
        );
        updateMediaMetadata(selectedMedia, season, episode);
        if (showPlayer) {
          updateContinueWatching(selectedMedia, season, episode);
        }
      }
    }
  };

  // Close detail modal and restore clean URL
  const handleCloseModal = () => {
    setSelectedMedia(null);
    setShowPlayer(false);
    resetMediaMetadata();

    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname || '/';
      const cleanUrl = activeTab && activeTab !== 'home'
        ? `${pathname}?tab=${activeTab}`
        : pathname;
      window.history.pushState({ tab: activeTab }, '', cleanUrl);
    }
  };

  // Close player (returns to detail view)
  const handleClosePlayer = () => {
    setShowPlayer(false);
  };

  return (
    <div className="bg-[#07080b] text-white min-h-screen flex flex-col antialiased">
      {/* Top Navbar */}
      <Header
        lang={lang}
        onLangChange={handleLanguageChange}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        favoritesCount={favorites.length}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        searchResults={searchResults}
        searchLoading={searchLoading}
        onSelectResult={(item) => {
          handleOpenDetail(item.id, item.media_type || 'movie', item.title || item.name);
          setSearchOpen(false);
          setSearchQuery('');
        }}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#13151f]/95 text-white text-xs sm:text-sm font-bold px-5 py-2.5 rounded-full shadow-2xl border border-red-500/40 backdrop-blur-md flex items-center gap-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 pt-[72px] pb-[calc(76px+env(safe-area-inset-bottom,0px))] md:pb-0">
        {/* ===================== VIEW 1: HOME ===================== */}
        {activeTab === 'home' && (
          <div>
            {/* Hero Section */}
            <section className="relative overflow-hidden min-h-[380px] md:min-h-[460px] flex items-center border-b border-white/5">
              <div className="absolute inset-0 z-0">
                <img
                  src="https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1920&auto=format&fit=crop"
                  alt="Cinema background"
                  className="w-full h-full object-cover object-center filter brightness-[0.25]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07080b] via-[#07080b]/70 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#07080b]/90 via-transparent to-[#07080b]/90" />
              </div>

              <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 w-full text-center md:text-start flex flex-col items-center md:items-start">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/10 border border-red-500/20 text-red-400 text-xs font-semibold mb-4 backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  {t.hero_badge || 'سيرفرات سريعة بدقة 4K و HD مع ترجمة احترافية'}
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight max-w-3xl mb-4">
                  {t.hero_title_part1} <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-rose-400">{t.hero_title_part2}</span>
                </h1>
                <p className="text-sm sm:text-base text-gray-300 max-w-2xl mb-8 leading-relaxed">
                  {t.hero_desc}
                </p>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('movies-catalog');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-sm px-7 py-3 rounded-full shadow-lg shadow-red-600/30 transition-transform active:scale-95 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {t.btn_watch_now}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('search')}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium text-sm px-6 py-3 rounded-full backdrop-blur-md border border-white/10 transition cursor-pointer"
                  >
                    <SearchIcon className="w-4 h-4" />
                    {t.btn_search}
                  </button>
                </div>
              </div>
            </section>

            {/* Continue Watching Section */}
            {continueWatching.length > 0 && (
              <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-red-600 rounded-full" />
                    <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                      {t.continue_watching}
                      <span className="text-xs font-normal text-gray-400">({continueWatching.length})</span>
                    </h2>
                  </div>
                  <button
                    onClick={() => {
                      setContinueWatching([]);
                      try {
                        localStorage.removeItem(LOCAL_CONTINUE_WATCHING_KEY);
                      } catch {}
                    }}
                    className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t.clear_history || 'مسح السجل'}
                  </button>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-4 pt-1 no-scrollbar scroll-smooth">
                  {continueWatching.map((item) => (
                    <div
                      key={item.id}
                      className="group relative flex-shrink-0 w-36 sm:w-44 bg-[#13151f] rounded-xl overflow-hidden border border-white/5 hover:border-red-500/30 transition-all shadow-md"
                    >
                      <div
                        onClick={() => handleOpenDetail(item.id, item.mediaType, item.title, item.season, item.episode)}
                        className="cursor-pointer"
                      >
                        <div className="relative aspect-[2/3] w-full bg-black/40 overflow-hidden">
                          {item.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-600">
                              <Film className="w-8 h-8" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </div>
                          </div>
                          {item.season && item.episode && (
                            <span className="absolute top-2 right-2 bg-black/80 backdrop-blur-md text-[10px] font-bold text-amber-400 px-2 py-0.5 rounded-md border border-white/10">
                              S{item.season} E{item.episode}
                            </span>
                          )}
                        </div>

                        <div className="p-2.5">
                          <h4 className="text-xs font-bold text-gray-200 truncate group-hover:text-red-400 transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-[10px] text-gray-400 mt-0.5 flex items-center justify-between">
                            <span>{item.mediaType === 'tv' ? t.series_label || 'مسلسل' : t.movie_label || 'فيلم'}</span>
                            <span className="text-red-400 font-semibold">{t.btn_resume || 'استئناف'}</span>
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromHistory(item.id);
                        }}
                        title={t.remove || 'إزالة'}
                        className="absolute top-2 left-2 p-1.5 rounded-full bg-black/70 hover:bg-red-600 text-gray-300 hover:text-white transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Catalog Main Section */}
            <section id="movies-catalog" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {/* Category Filters Bar */}
              <div className="mb-6">
                <GenreChips
                  lang={lang}
                  selectedGenres={selectedGenres}
                  onToggleGenre={handleToggleGenre}
                  onClearGenres={handleClearGenres}
                  genreLogic={genreLogic}
                  onChangeLogic={(newLogic) => setGenreLogic(newLogic)}
                />
              </div>

              {/* Media Grid Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-red-600 rounded-full" />
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    {selectedGenres.length > 0 ? t.filtered_results : t.latest_movies}
                  </h2>
                </div>
                {media.length > 0 && (
                  <span className="text-xs text-gray-400 font-medium">
                    {media.length} {t.results_count_label}
                  </span>
                )}
              </div>

              {/* Grid content / Loading skeleton */}
              {loading || isInitialPermalinkLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="animate-pulse bg-[#13151f] rounded-xl aspect-[2/3] border border-white/5" />
                  ))}
                </div>
              ) : media.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
                  {media.map((item) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      isFavorite={favorites.some((f) => f.id === item.id)}
                      onToggleFavorite={toggleFavorite}
                      onOpenDetail={(mediaItem) =>
                        handleOpenDetail(
                          mediaItem.id,
                          mediaItem.mediaType || mediaItem.media_type || 'movie',
                          mediaItem.title || mediaItem.name
                        )
                      }
                      onQuickPlay={handleQuickPlay}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 px-4 bg-[#13151f] rounded-2xl border border-white/5 my-6">
                  <Film className="w-14 h-14 text-gray-600 mx-auto mb-3" />
                  <h3 className="font-bold text-base text-gray-200 mb-1">{t.no_movies_found}</h3>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto mb-5 leading-relaxed">
                    {t.no_movies_desc}
                  </p>
                  <button
                    type="button"
                    onClick={handleClearGenres}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-6 py-2.5 rounded-full shadow-lg shadow-red-600/30 transition cursor-pointer"
                  >
                    {t.clear_filters}
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ===================== VIEW 2: SEARCH ===================== */}
        {activeTab === 'search' && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[60vh]">
            <div className="max-w-2xl mx-auto mb-8 text-center">
              <h2 className="text-2xl sm:text-3xl font-black mb-2">{t.search_title}</h2>
              <p className="text-xs sm:text-sm text-gray-400 mb-6">{t.search_subtitle}</p>

              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={t.search_placeholder}
                  className="w-full bg-[#13151f] border border-white/10 focus:border-red-500 rounded-full py-3.5 pr-12 pl-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 shadow-xl transition"
                />
                <SearchIcon className="w-5 h-5 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {searchLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="animate-pulse bg-[#13151f] rounded-xl aspect-[2/3] border border-white/5" />
                ))}
              </div>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
                {searchResults.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    isFavorite={favorites.some((f) => f.id === item.id)}
                    onToggleFavorite={toggleFavorite}
                    onOpenDetail={(mediaItem) =>
                      handleOpenDetail(
                        mediaItem.id,
                        mediaItem.mediaType || mediaItem.media_type || 'movie',
                        mediaItem.title || mediaItem.name
                      )
                    }
                    onQuickPlay={handleQuickPlay}
                  />
                ))}
              </div>
            ) : searchQuery.trim().length >= 2 ? (
              <div className="text-center py-16 px-4 bg-[#13151f] rounded-2xl border border-white/5">
                <SearchIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <h3 className="font-bold text-base text-gray-200 mb-1">{t.search_no_results}</h3>
                <p className="text-xs text-gray-400">{t.search_try_different}</p>
              </div>
            ) : (
              <div className="text-center py-20 text-gray-500">
                <SearchIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-xs">{t.search_initial_prompt}</p>
              </div>
            )}
          </section>
        )}

        {/* ===================== VIEW 3: FAVORITES ===================== */}
        {activeTab === 'favorites' && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[60vh]">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-6 bg-red-600 rounded-full" />
                <h2 className="text-lg sm:text-xl font-bold text-white">{t.my_favorites}</h2>
                <span className="text-xs bg-red-600/20 text-red-400 font-bold px-2 py-0.5 rounded-full">
                  {favorites.length}
                </span>
              </div>

              {!user && (
                <button
                  type="button"
                  onClick={handleLogin}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium underline cursor-pointer"
                >
                  {t.login_to_sync}
                </button>
              )}
            </div>

            {favorites.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
                {favorites.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    isFavorite={true}
                    onToggleFavorite={toggleFavorite}
                    onOpenDetail={(mediaItem) =>
                      handleOpenDetail(
                        mediaItem.id,
                        mediaItem.mediaType || mediaItem.media_type || 'movie',
                        mediaItem.title || mediaItem.name
                      )
                    }
                    onQuickPlay={handleQuickPlay}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 px-4 bg-[#13151f] rounded-2xl border border-white/5 my-6">
                <Bookmark className="w-14 h-14 text-gray-600 mx-auto mb-3" />
                <h3 className="font-bold text-base text-gray-200 mb-1">{t.favorites_empty}</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto mb-5 leading-relaxed">
                  {t.fav_guest_note}
                </p>
                <button
                  type="button"
                  onClick={() => handleTabChange('home')}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-6 py-2.5 rounded-full shadow-lg shadow-red-600/30 transition cursor-pointer"
                >
                  {t.btn_browse}
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer with Working Links */}
      <Footer
        lang={lang}
        onTabChange={handleTabChange}
        onSelectGenre={(genreId) => {
          setSelectedGenres([genreId]);
          handleTabChange('home');
          if (typeof window !== 'undefined') {
            setTimeout(() => {
              document.getElementById('movies-catalog')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }
        }}
      />

      {/* Mobile Bottom Navigation Bar (Hidden when video player is active) */}
      <MobileNav
        lang={lang}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        favoritesCount={favorites.length}
        hidden={showPlayer}
      />

      {/* Detail Modal Component */}
      {selectedMedia && !showPlayer && (
        <DetailPanel
          media={selectedMedia}
          lang={lang}
          isFavorite={favorites.some((f) => f.id === selectedMedia.id)}
          onToggleFavorite={toggleFavorite}
          onClose={handleCloseModal}
          onWatch={() => {
            setShowPlayer(true);
            updateContinueWatching(selectedMedia, currentSeason, currentEpisode);
          }}
          currentSeason={currentSeason}
          currentEpisode={currentEpisode}
          onSelectEpisode={handleSelectEpisode}
        />
      )}

      {/* Full Feature Video Player with Subtitles & Embeds */}
      {showPlayer && selectedMedia && (
        <Player
          media={selectedMedia}
          currentSeason={currentSeason}
          currentEpisode={currentEpisode}
          onClose={handleClosePlayer}
          onSelectEpisode={handleSelectEpisode}
          lang={lang}
        />
      )}

      {/* Unauthorized Domain Guide Modal */}
      {unauthorizedDomain && (
        <UnauthorizedDomainModal
          domain={unauthorizedDomain}
          lang={lang}
          onClose={() => setUnauthorizedDomain(null)}
        />
      )}
    </div>
  );
}
