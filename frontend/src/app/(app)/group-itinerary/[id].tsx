import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../services/api';
import LeafletMap from '../../../components/LeafletMap';
import { MapMarker } from '../../../components/leafletHtml';
import { errMsg } from '../../../components/ui';

type MemberScore = { userId: string; score: number };
type Place = {
  name: string; kind?: string; location?: { lat: number; lon: number };
  visitMinutes?: number; travelMinutesFromPrevious?: number;
  source?: 'consensus' | 'roundrobin' | 'solo' | 'manual';
  selectedFor?: string | null; memberScores?: MemberScore[]; reason?: string; minScore?: number; score?: number;
};
type Day = { day: number; date?: string; places: Place[]; capacityMinutes?: number; visitMinutes?: number; travelMinutes?: number };
type Sat = { userId: string; avgScore: number; cumSat?: number };
type Itin = { days: Day[]; satisfaction?: Sat[]; warnings?: string[]; startDate?: string; endDate?: string; travelTimeSource?: string };

const DAY_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626', '#0891b2', '#ca8a04'];
const colorOf = (d: number) => DAY_COLORS[(d - 1) % DAY_COLORS.length];
const pct = (x?: number) => Math.round((x ?? 0) * 100);
const label = (k?: string) => (k ? k.replace(/_/g, ' ') : '');

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <View style={s.barBg}>
      <View style={[s.barFill, { width: `${Math.min(100, Math.max(0, value * 100))}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function GroupItineraryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [it, setIt] = useState<Itin | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/groups/${id}/itinerary`);
        if (alive) setIt(data);
      } catch (e) {
        if (alive) setError(errMsg(e, 'Could not load the itinerary'));
      } finally {
        if (alive) setLoading(false);
      }
      try {
        const { data: g } = await api.get(`/groups/${id}`);
        const map: Record<string, string> = {};
        (g.members || []).forEach((m: any) => {
          const u = m.userId;
          if (u && typeof u === 'object') map[String(u._id)] = u.name || 'Member';
        });
        if (alive) setNames(map);
      } catch {
        /* names are optional */
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const nameOf = (uid?: string | null) => (uid && names[String(uid)]) || 'a member';

  const markers: MapMarker[] = useMemo(
    () =>
      (it?.days ?? []).flatMap((d) =>
        d.places
          .filter((p) => p.location && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lon))
          .map((p, i) => ({ lat: p.location!.lat, lon: p.location!.lon, label: p.name, num: i + 1, color: colorOf(d.day) }))
      ),
    [it]
  );

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} />;

  const header = (
    <>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))}>
        <Text style={s.link}>← Back</Text>
      </Pressable>
      <Text style={s.title}>Group itinerary</Text>
    </>
  );

  if (!it) {
    return (
      <View style={s.container}>
        {header}
        <Text style={s.muted}>{error ?? 'No itinerary yet.'}</Text>
        <Text style={s.muted}>The group owner can generate one from the group page.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.container}>
      {header}
      {it.startDate && it.endDate && <Text style={s.muted}>{it.startDate} to {it.endDate} · {it.days.length} days</Text>}

      {markers.length > 0 && <LeafletMap markers={markers} height={260} />}
      {it.travelTimeSource === 'haversine' && (
        <Text style={s.warn}>Travel times are estimates (straight-line distance), road data was not available.</Text>
      )}

      {/* Fairness: how well the plan fits each member */}
      {!!it.satisfaction?.length && (
        <View style={s.box}>
          <Text style={s.h2}>How well the plan fits each member</Text>
          <Text style={s.muted}>Average match score of the chosen places for each member.</Text>
          {it.satisfaction.map((m) => (
            <View key={m.userId} style={{ marginTop: 8 }}>
              <View style={s.rowBetween}>
                <Text style={s.name}>{nameOf(m.userId)}</Text>
                <Text style={s.name}>{pct(m.avgScore)}%</Text>
              </View>
              <Bar value={m.avgScore} color="#2563eb" />
            </View>
          ))}
        </View>
      )}

      {!!it.warnings?.length && (
        <View style={[s.box, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
          <Text style={s.h2}>Notes</Text>
          {it.warnings.map((w, i) => <Text key={i} style={s.note}>• {w}</Text>)}
        </View>
      )}

      {it.days.map((day) => (
        <View key={day.day} style={{ marginTop: 18 }}>
          <Text style={[s.dayTitle, { color: colorOf(day.day) }]}>
            Day {day.day}{day.date ? ` · ${day.date}` : ''}
          </Text>
          <Text style={s.muted}>
            {day.places.length} places · visit {day.visitMinutes ?? 0} min · travel {Math.round(day.travelMinutes ?? 0)} min
            {day.capacityMinutes ? ` · capacity ${day.capacityMinutes} min` : ''}
          </Text>

          {day.places.length === 0 && <Text style={s.muted}>No places on this day.</Text>}
          {day.places.map((p, i) => (
            <View key={`${day.day}-${i}`} style={s.card}>
              <View style={s.cardTop}>
                <View style={[s.badge, { backgroundColor: colorOf(day.day) }]}><Text style={s.badgeText}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.placeName}>{p.name}</Text>
                  <Text style={s.muted}>
                    {label(p.kind)} · {p.visitMinutes ?? 0} min{i > 0 ? ` · ${Math.round(p.travelMinutesFromPrevious ?? 0)} min travel` : ''}
                  </Text>
                </View>
              </View>

              {p.source === 'consensus' && <Text style={[s.pill, s.pillGreen]}>Everyone likes this place</Text>}
              {p.source === 'roundrobin' && <Text style={[s.pill, s.pillOrange]}>Picked for {nameOf(p.selectedFor)}</Text>}
              {!!p.reason && <Text style={s.reason}>{p.reason}</Text>}

              {!!p.memberScores?.length && (
                <View style={{ marginTop: 8 }}>
                  {p.memberScores.map((m) => (
                    <View key={m.userId} style={s.scoreRow}>
                      <Text style={s.scoreName} numberOfLines={1}>{nameOf(m.userId)}</Text>
                      <View style={{ flex: 1 }}><Bar value={m.score} color={m.score >= 0.5 ? '#16a34a' : '#ea580c'} /></View>
                      <Text style={s.scoreVal}>{pct(m.score)}%</Text>
                    </View>
                  ))}
                  {p.minScore != null && <Text style={s.muted}>Least happy member: {pct(p.minScore)}%</Text>}
                </View>
              )}
            </View>
          ))}
        </View>
      ))}

      <Pressable style={s.chatBtn} onPress={() => router.push(`/group-chat/${id}` as any)}>
        <Text style={s.chatBtnText}>Discuss in group chat</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 20, paddingTop: 48, paddingBottom: 60, backgroundColor: '#f8fafc', width: '100%', maxWidth: 900, alignSelf: 'center' },
  link: { color: '#2563eb', fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', marginVertical: 8 },
  muted: { color: '#64748b', fontSize: 13, marginTop: 2 },
  warn: { color: '#92400e', fontSize: 13, marginTop: 8 },
  box: { marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  h2: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  note: { color: '#92400e', fontSize: 13, marginTop: 4 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  dayTitle: { fontSize: 20, fontWeight: '800' },
  card: { marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  cardTop: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  placeName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  pill: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  pillGreen: { backgroundColor: '#dcfce7', color: '#166534' },
  pillOrange: { backgroundColor: '#ffedd5', color: '#9a3412' },
  reason: { marginTop: 6, color: '#334155', fontSize: 13 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  scoreName: { width: 90, fontSize: 12, color: '#475569' },
  scoreVal: { width: 38, textAlign: 'right', fontSize: 12, color: '#475569' },
  chatBtn: { marginTop: 24, backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  chatBtnText: { color: '#fff', fontWeight: '800' },
});