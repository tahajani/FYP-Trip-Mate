import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../services/api';
import LeafletMap from '../../../components/LeafletMap';
import PlaceSearch from '../../../components/PlaceSearch';
import { MapMarker } from '../../../components/leafletHtml';
import { SearchResult, Trip, TripDay, TripPlace } from '../../../types/trip';

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
  const [warnings, setWarnings] = useState<string[]>([]);
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
      source: 'manual',
    };
    edit((ds) => void dayOf(ds, dayNo).places.push(p));
  };

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
          source: p.source,
        })),
      }));
      const { data } = await api.put(`/itineraries/${id}/days`, { days: payload });
      setTrip(data.itinerary);
      setDays(data.itinerary.days);
      setWarnings(data.warnings ?? []);
      setDirty(false);
      setOpenKey(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Save nahi hua');
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

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} />;
  if (!trip) return <Text style={s.error}>{error ?? 'Itinerary nahi mili'}</Text>;

  const editable = sel !== 'all';
  const visibleDays = sel === 'all' ? days : days.filter((d) => d.day === sel);

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Text style={s.link}>← Wapas</Text>
      </Pressable>
      <Text style={s.title}>Tumhari itinerary</Text>

      <LeafletMap markers={markers} height={280} />
      <Text style={s.hint}>Lakeer seedhi line hai (sadak ka raasta nahi). Marker dabao to naam dikhega.</Text>

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
              <Text style={s.dayTitle}>Din {day.day}</Text>
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
              {dirty && editable ? ' (safar ka waqt save ke baad update hoga)' : ''}
            </Text>

            {day.places.length === 0 && <Text style={s.muted}>Is din mein abhi koi jagah nahi.</Text>}

            {day.places.map((p, i) => {
              const key = `${day.day}-${i}-${p.name}`;
              const open = editable && openKey === key;
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
                      </Text>
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

      {warnings.map((w, i) => (
        <Text key={i} style={s.warn}>
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
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', marginVertical: 12 },
  hint: { color: '#64748b', fontSize: 12, marginTop: 6 },
  muted: { color: '#64748b', marginTop: 8 },
  tab: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, backgroundColor: '#fff' },
  tabAll: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tabText: { fontWeight: '700', color: '#0f172a' },
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
  more: { color: '#94a3b8' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, paddingTop: 0 },
  act: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  actText: { fontWeight: '600', color: '#0f172a', fontSize: 13 },
  addBtn: { borderWidth: 1, borderColor: '#2563eb', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  addText: { color: '#2563eb', fontWeight: '700' },
  warn: { color: '#92400e', marginTop: 8, fontSize: 13 },
  error: { color: '#b91c1c', marginTop: 12 },
  save: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
