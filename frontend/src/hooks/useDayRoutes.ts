// Fetches the road route (OSRM, with straight-line fallback done by the backend) for the day(s) on screen.
// POST /api/routes/day  { places: [{ lat, lon }] }  ->  DayRoute
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import type { TripDay } from '../types/trip';

export type RouteLeg = { km: number; minutes: number };
export type DayRoute = {
  source: 'osrm' | 'haversine' | 'none';
  coordinates: [number, number][]; // [lat, lon], Leaflet order
  legs: RouteLeg[]; // legs[i] = stop i -> stop i + 1
  totalKm: number;
  totalMinutes: number;
  warnings: string[];
};

const DEBOUNCE_MS = 500; // edits (up/down/move) should not fire one OSRM request per tap

type Wanted = { day: number; points: { lat: number; lon: number }[] };

export function useDayRoutes(days: TripDay[], selected: number | 'all') {
  const [routes, setRoutes] = useState<Record<number, DayRoute>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false); // the request itself failed (backend down / not mounted / 401)
  const [refreshKey, setRefreshKey] = useState(0);
  const cache = useRef(new Map<string, DayRoute>()); // only real OSRM answers are kept

  const shown = selected === 'all' ? days : days.filter((d) => d.day === selected);
  const wanted: Wanted[] = shown
    .map((d) => ({
      day: d.day,
      points: d.places
        .filter((p) => p.location && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lon))
        .map((p) => ({ lat: p.location.lat, lon: p.location.lon })),
    }))
    .filter((w) => w.points.length >= 2);
  const signature = JSON.stringify(wanted);

  useEffect(() => {
    const list: Wanted[] = JSON.parse(signature);
    let cancelled = false;
    if (list.length === 0) {
      setRoutes({});
      setLoading(false);
      setFailed(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const next: Record<number, DayRoute> = {};
      let anyFailed = false;
      await Promise.all(
        list.map(async (w) => {
          const key = JSON.stringify(w.points);
          let route = cache.current.get(key);
          if (!route) {
            try {
              const { data } = await api.post<DayRoute>('/routes/day', { places: w.points });
              route = data;
              if (route.source === 'osrm') cache.current.set(key, route);
            } catch {
              anyFailed = true;
            }
          }
          if (route) next[w.day] = route;
        })
      );
      if (cancelled) return;
      setRoutes(next);
      setFailed(anyFailed);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signature, refreshKey]);

  // "try again" button: forget cached routes and fetch again
  const refresh = useCallback(() => {
    cache.current.clear();
    setRefreshKey((k) => k + 1);
  }, []);

  return { routes, loading, failed, refresh };
}