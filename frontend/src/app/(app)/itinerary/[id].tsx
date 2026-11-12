import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../services/api';
import LeafletMap from '../../../components/LeafletMap';
import PlaceSearch from '../../../components/PlaceSearch';
import { MapMarker, RouteLine } from '../../../components/leafletHtml';
import { useDayRoutes } from '../../../hooks/useDayRoutes';
import { SearchResult, Trip, TripDay, TripPlace } from '../../../types/trip';
import { formatDay, formatShort } from '../../../utils/dates';
import { categoryLabel } from '../../../utils/labels';

const DAY_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626', '#0891b2', '#ca8a04'];
const colorOf = (day: number) => DAY_COLORS[(day - 1) % DAY_COLORS.length];
const ISLAMABAD = { lat: 33.6844, lon: 73.0479 }; // only used if the trip has no places at all

export default function ItineraryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<TripDay[]>([]);
  const [sel, setSel] = useState<number | 'all'>(1);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editWarnings, setEditWarnings] = useState<string[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/itineraries/${id}`);
        setTrip(data);
        setDays(data.days);
        setSel(data.days[0]?.day ?? 1);
      } catch (e: any) {
        setError(e?.response?.data?.message ?? 'Itinerary load nahi hui');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ---- day adjustment (local edits, saved with the Save button) ----
  const edit = (fn: (d: TripDay[]) => void) => {
    setDays((prev) => {
      const copy = prev.map((d) => ({ ...d, places: [...d.places] }));
      fn(copy);
      return copy;
    });
    setDirty(true);
  };
  const dayOf = (ds: TripDay[], n: number) => ds.find((d) => d.day === n)!;
  const removePlace = (dayNo: number, i: number) => edit((ds) => void dayOf(ds, dayNo).places.splice(i, 1));
  const movePlace = (dayNo: number, i: number, dir: -1 | 1) =>
    edit((ds) => {
      const p = dayOf(ds, dayNo).places;
      const j = i + dir;
      if (j < 0 || j >= p.length) return;
      [p[i], p[j]] = [p[j], p[i]];
    });
  const moveToDay = (from: number, i: number, to: number) =>
    edit((ds) => {
      const [p] = dayOf(ds, from).places.splice(i, 1);
      dayOf(ds, to).places.push(p);
    });
  const addPlace = (dayNo: number, r: SearchResult) => {
    const p: TripPlace = {
      poiId: r.poiId,
      name: r.name,
      kind: r.kind,
      location: r.location,
      visitMinutes: r.visitMinutes ?? 60,
      travelMinutesFromPrevious: 0,
      matched: [],
      source: 'manual',
    };
    edit((ds) => void dayOf(ds, dayNo).places.push(p));
  };

  // Saving also asks the backend for the road times again (OSRM), so it doubles as "recalculate travel".
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = days.map((d) => ({
        day: d.day,
        places: d.places.map((p) => ({
          poiId: p.poiId,
          name: p.name,
          kind: p.kind,
          location: p.location,
          visitMinutes: p.visitMinutes,
          score: p.score,
          matched: p.matched,
          source: p.source,
        })),
      }));
      const { data } = await api.put(`/itineraries/${id}/days`, { days: payload });
      setTrip(data.itinerary);
      setDays(data.itinerary.days);
      setEditWarnings(data.warnings ?? []);
      setDirty(false);
      setOpenKey(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Save nahi hua');
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async (dayNo: number) => {
  setSaving(true);
  setError(null);
  try {
    const { data } = await api.post(`/itineraries/${id}/days/${dayNo}/regenerate`);
    setTrip(data.itinerary);
    setDays(data.itinerary.days);
    setEditWarnings(data.warnings ?? []);
    setDirty(false);
    setOpenKey(null);
  } catch (e: any) {
    setError(e?.response?.data?.message ?? 'Din dobara nahi bana');
  } finally {
    setSaving(false);
  }
};

  // ---- map + search centre ----
  const markers: MapMarker[] = useMemo(() => {
    const shown = sel === 'all' ? days : days.filter((d) => d.day === sel);
    return shown.flatMap((d) =>
      d.places
        .filter((p) => p.location && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lon))
        .map((p, i) => ({ lat: p.location.lat, lon: p.location.lon, label: p.name, num: i + 1, color: colorOf(d.day) }))
    );
  }, [days, sel]);

  const center = useMemo(() => {
    const all = days.flatMap((d) => d.places).filter((p) => p.location);
    if (!all.length) return ISLAMABAD;
    return {
      lat: all.reduce((a, p) => a + p.location.lat, 0) / all.length,
      lon: all.reduce((a, p) => a + p.location.lon, 0) / all.length,
    };
  }, [days]);

  // ---- road routes (OSRM, backend falls back to straight lines) ----
  const { routes, loading: routesLoading, failed: routesFailed, refresh: refreshRoutes } = useDayRoutes(days, sel);

  // A route is used only if it matches the stops on screen (legs = stops - 1); otherwise it is stale after an edit.
  const routeOf = (day: TripDay) => {
    const r = routes[day.day];
    return r && r.legs.length === day.places.length - 1 ? r : undefined;
  };

  const routeLines: RouteLine[] = useMemo(() => {
    const shown = sel === 'all' ? days : days.filter((d) => d.day === sel);
    return shown.map((d) => {
      const r = routes[d.day];
      const usable = r && r.legs.length === d.places.length - 1;
      if (usable) return { color: colorOf(d.day), coords: r.coordinates, road: r.source === 'osrm' };
      // loading / failed / stale: dashed straight line between the stops
      const straight = d.places
        .filter((p) => p.location && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lon))
        .map((p) => [p.location.lat, p.location.lon] as [number, number]);
      return { color: colorOf(d.day), coords: straight, road: false };
    });
  }, [days, sel, routes]);

  // One label for the map: every shown day with 2+ stops must have a real road route to say "OSRM".
  const shownWithRoute = (sel === 'all' ? days : days.filter((d) => d.day === sel)).filter((d) => d.places.length >= 2);
  const allRoad = shownWithRoute.length > 0 && shownWithRoute.every((d) => routeOf(d)?.source === 'osrm');
  const routeNote = shownWithRoute
    .map((d) => routeOf(d)?.warnings?.[0])
    .find((w): w is string => !!w);

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} />;
  if (!trip) return <Text style={s.error}>{error ?? 'Itinerary nahi mili'}</Text>;

  const editable = sel !== 'all';
  const visibleDays = sel === 'all' ? days : days.filter((d) => d.day === sel);
  // "estimated" is shown in the travel banner below, the other saved warnings (coverage, dropped, moved) as a list
  const savedWarnings = (trip.warnings ?? []).filter((w) => !/estimated from straight-line/i.test(w));

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Text style={s.link}>← Wapas</Text>
      </Pressable>
      <Text style={s.title}>Tumhari itinerary</Text>
      {trip.startDate && trip.endDate && (
        <Text style={s.dates}>
          {formatDay(trip.startDate)} se {formatDay(trip.endDate)} tak · {days.length} din
        </Text>
      )}

      <LeafletMap markers={markers} routes={routeLines} height={280} />
      {shownWithRoute.length === 0 ? (
        <Text style={s.hint}>Marker dabao to naam dikhega.</Text>
      ) : routesLoading ? (
        <Text style={s.hint}>Sadak ka raasta load ho raha hai... (tab tak seedhi line)</Text>
      ) : allRoad ? (
        <Text style={s.ok}>━ Sadak (OSRM): asli sadak ka raasta. Marker dabao to naam dikhega.</Text>
      ) : (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            ┅ Seedhi line (andaza): sadak ka raasta nahi mila.
            {routesFailed ? ' Server se route request fail hui (backend /api/routes/day check karo).' : ''}
          </Text>
          {routeNote ? <Text style={[s.hint, { color: '#92400e' }]}>{routeNote}</Text> : null}
          <Pressable style={s.bannerBtn} onPress={refreshRoutes}>
            <Text style={s.bannerBtnText}>Sadak ka raasta dobara try karo</Text>
          </Pressable>
        </View>
      )}

      {trip.travelTimeSource === 'haversine' ? (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            Safar ka waqt sirf andaza hai (seedhi doori se), kyunke sadak ka data (OSRM) nahi mila.
          </Text>
          <Pressable style={s.bannerBtn} onPress={save} disabled={saving}>
            <Text style={s.bannerBtnText}>{saving ? 'Ruko...' : 'Sadak ka waqt dobara nikalo'}</Text>
          </Pressable>
        </View>
      ) : trip.travelTimeSource === 'osrm' ? (
        <Text style={s.ok}>✓ Safar ka waqt asli sadak ke hisaab se (OSRM)</Text>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
        {days.map((d) => (
          <Pressable
            key={d.day}
            style={[s.tab, sel === d.day && { backgroundColor: colorOf(d.day), borderColor: colorOf(d.day) }]}
            onPress={() => {
              setSel(d.day);
              setOpenKey(null);
              setShowSearch(false);
            }}
          >
            <Text style={[s.tabText, sel === d.day && { color: '#fff' }]}>Din {d.day}</Text>
            {d.date && <Text style={[s.tabDate, sel === d.day && { color: '#fff' }]}>{formatShort(d.date)}</Text>}
          </Pressable>
        ))}
        <Pressable style={[s.tab, sel === 'all' && s.tabAll]} onPress={() => setSel('all')}>
          <Text style={[s.tabText, sel === 'all' && { color: '#fff' }]}>Sab din</Text>
        </Pressable>
      </ScrollView>

      {visibleDays.map((day) => {
        const visit = day.places.reduce((a, p) => a + p.visitMinutes, 0);
        const travel = day.places.reduce((a, p) => a + (p.travelMinutesFromPrevious ?? 0), 0);
        const total = Math.round(visit + travel);
        const over = total > day.capacityMinutes;
        return (
          <View key={day.day} style={{ marginTop: 16 }}>
            <View style={s.dayHead}>
              <Text style={s.dayTitle}>
                Din {day.day}
                {day.date ? ` · ${formatDay(day.date)}` : ''}
              </Text>
              <Text style={[s.dayTotal, over && { color: '#b91c1c' }]}>
                {total} / {day.capacityMinutes} min
              </Text>
            </View>
            <View style={s.bar}>
              <View
                style={{
                  width: `${Math.min(100, (total / day.capacityMinutes) * 100)}%`,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: over ? '#dc2626' : colorOf(day.day),
                }}
              />
            </View>
            <Text style={s.hint}>
              {day.places.length} jagah · visit {visit} min · safar {Math.round(travel)} min
              {routeOf(day)
                ? ` · ${routeOf(day)!.totalKm.toFixed(1)} km ${routeOf(day)!.source === 'osrm' ? '(sadak)' : '(andaza)'}`
                : ''}
              {dirty && editable ? ' (safar ka waqt save ke baad update hoga)' : ''}
            </Text>

            {editable && (
              <Pressable style={[s.act, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={() => regenerate(day.day)} disabled={saving || dirty}>
                <Text style={s.actText}>↻ Is din ko dobara banao{dirty ? ' (pehle save karo)' : ''}</Text>
              </Pressable>
            )}

            {day.places.length === 0 && <Text style={s.muted}>Is din mein abhi koi jagah nahi.</Text>}

            {day.places.map((p, i) => {
              const key = `${day.day}-${i}-${p.name}`;
              const open = editable && openKey === key;
              const matched = p.matched ?? [];
              return (
                <View key={key} style={s.card}>
                  <Pressable style={s.cardRow} onPress={() => editable && setOpenKey(open ? null : key)}>
                    <View style={[s.badge, { backgroundColor: colorOf(day.day) }]}>
                      <Text style={s.badgeText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.placeName}>{p.name}</Text>
                      <Text style={s.meta}>
                        {p.kind.replace(/_/g, ' ')} · {p.visitMinutes} min
                        {i > 0 ? ` · ${p.travelMinutesFromPrevious ?? 0} min safar` : ''}
                        {i > 0 && routeOf(day)
                          ? ` · ${routeOf(day)!.legs[i - 1].km.toFixed(1)} km ${routeOf(day)!.source === 'osrm' ? 'sadak' : '(andaza)'}`
                          : ''}
                      </Text>
                      <View style={s.pills}>
                        {matched.map((c) => (
                          <Text key={c} style={[s.pill, s.pillMatch]}>
                            {categoryLabel(c)}
                          </Text>
                        ))}
                        {p.source === 'manual' && <Text style={[s.pill, s.pillManual]}>Tumne add ki</Text>}
                        {p.source !== 'manual' && matched.length === 0 && (
                          <Text style={[s.pill, s.pillWarn]}>Pasand se match nahi</Text>
                        )}
                      </View>
                    </View>
                    {editable && <Text style={s.more}>{open ? '▲' : '▼'}</Text>}
                  </Pressable>

                  {open && (
                    <View style={s.actions}>
                      <Pressable style={s.act} onPress={() => movePlace(day.day, i, -1)}>
                        <Text style={s.actText}>↑ Upar</Text>
                      </Pressable>
                      <Pressable style={s.act} onPress={() => movePlace(day.day, i, 1)}>
                        <Text style={s.actText}>↓ Neeche</Text>
                      </Pressable>
                      {days
                        .filter((d) => d.day !== day.day)
                        .map((d) => (
                          <Pressable
                            key={d.day}
                            style={s.act}
                            onPress={() => {
                              moveToDay(day.day, i, d.day);
                              setOpenKey(null);
                            }}
                          >
                            <Text style={s.actText}>→ Din {d.day}</Text>
                          </Pressable>
                        ))}
                      <Pressable
                        style={[s.act, { borderColor: '#fecaca' }]}
                        onPress={() => {
                          removePlace(day.day, i);
                          setOpenKey(null);
                        }}
                      >
                        <Text style={[s.actText, { color: '#b91c1c' }]}>✕ Hatao</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}

      {editable ? (
        <>
          <Pressable style={s.addBtn} onPress={() => setShowSearch((v) => !v)}>
            <Text style={s.addText}>+ Jagah add karo</Text>
          </Pressable>
          {showSearch && (
            <PlaceSearch
              lat={center.lat}
              lon={center.lon}
              onClose={() => setShowSearch(false)}
              onPick={(r) => {
                addPlace(sel as number, r);
                setShowSearch(false);
              }}
            />
          )}
        </>
      ) : (
        <Text style={[s.hint, { marginTop: 16 }]}>Badalne ke liye ek din chuno.</Text>
      )}

      {savedWarnings.length > 0 && (
        <View style={s.notes}>
        <Text style={s.notesTitle}>Dhyan dene wali baatein</Text>
          {savedWarnings.map((w, i) => (
            <Text key={i} style={s.warn}>
              • {w}
            </Text>
          ))}
        </View>
      )}
      {editWarnings.map((w, i) => (
        <Text key={`e${i}`} style={s.warn}>
          {w}
        </Text>
      ))}
      {error && <Text style={s.error}>{error}</Text>}

      {dirty && (
        <Pressable style={[s.save, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>Changes save karo</Text>}
        </Pressable>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 20, paddingTop: 48, paddingBottom: 60, backgroundColor: '#f8fafc', flexGrow: 1 },
  link: { color: '#2563eb', fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', marginTop: 12 },
  dates: { color: '#475569', fontWeight: '600', marginTop: 4, marginBottom: 12 },
  hint: { color: '#64748b', fontSize: 12, marginTop: 6 },
  muted: { color: '#64748b', marginTop: 8 },
  ok: { color: '#15803d', fontSize: 12, marginTop: 8, fontWeight: '600' },
  banner: { backgroundColor: '#fffbeb', borderColor: '#fcd34d', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  bannerText: { color: '#92400e', fontSize: 13 },
  bannerBtn: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#f59e0b', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  bannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tab: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, backgroundColor: '#fff', alignItems: 'center' },
  tabAll: { backgroundColor: '#0f172a', borderColor: '#0f172a', justifyContent: 'center' },
  tabText: { fontWeight: '700', color: '#0f172a' },
  tabDate: { fontSize: 11, color: '#64748b', marginTop: 1 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  dayTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  dayTotal: { fontWeight: '700', color: '#475569' },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#e2e8f0', marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  cardRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  placeName: { fontWeight: '700', color: '#0f172a' },
  meta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  pillMatch: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  pillManual: { backgroundColor: '#ede9fe', color: '#6d28d9' },
  pillWarn: { backgroundColor: '#fef3c7', color: '#92400e' },
  more: { color: '#94a3b8' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, paddingTop: 0 },
  act: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  actText: { fontWeight: '600', color: '#0f172a', fontSize: 13 },
  addBtn: { borderWidth: 1, borderColor: '#2563eb', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  addText: { color: '#2563eb', fontWeight: '700' },
  notes: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginTop: 16 },
  notesTitle: { fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  warn: { color: '#92400e', marginTop: 6, fontSize: 13 },
  error: { color: '#b91c1c', marginTop: 12 },
  save: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});