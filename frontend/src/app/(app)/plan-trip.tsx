import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

type Region = { _id: string; slug: string; name?: string };

const MAX_DAYS = 7;

export default function PlanTrip() {
  const router = useRouter();
  const { user } = useAuth();
  const [regions, setRegions] = useState<Region[]>([]);
  const [region, setRegion] = useState<string | null>(null);
  const [days, setDays] = useState(2);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/places/regions');
        setRegions(data);
        if (data.length) setRegion(data[0].slug);
      } catch (e: any) {
        setError(e?.response?.data?.message ?? 'Regions load nahi hue');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const generate = async () => {
    if (!region) return;
    setBusy(true);
    setError(null);
    try {
      // takes a few seconds: candidates, K-Means, OSRM travel times, sequencing
      const { data } = await api.post('/itineraries/solo', { regionSlug: region, days });
      router.replace({ pathname: '/itinerary/[id]', params: { id: data.itinerary._id } });
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Itinerary nahi bani');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} />;

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Text style={s.link}>← Wapas</Text>
      </Pressable>
      <Text style={s.title}>Trip plan karo</Text>

      <Text style={s.label}>Shehar</Text>
      <View style={s.chips}>
        {regions.map((r) => (
          <Pressable key={r._id} style={[s.chip, region === r.slug && s.chipOn]} onPress={() => setRegion(r.slug)}>
            <Text style={[s.chipText, region === r.slug && s.chipTextOn]}>{r.name ?? r.slug}</Text>
          </Pressable>
        ))}
        {regions.length === 0 && <Text style={s.muted}>Abhi koi region seed nahi hua.</Text>}
      </View>

      <Text style={s.label}>Kitne din?</Text>
      <View style={s.stepper}>
        <Pressable style={s.stepBtn} onPress={() => setDays((d) => Math.max(1, d - 1))}>
          <Text style={s.stepText}>−</Text>
        </Pressable>
        <Text style={s.days}>{days}</Text>
        <Pressable style={s.stepBtn} onPress={() => setDays((d) => Math.min(MAX_DAYS, d + 1))}>
          <Text style={s.stepText}>+</Text>
        </Pressable>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Tumhari pasand</Text>
        <Text style={s.muted}>
          {user?.interests?.length ? user.interests.map((i) => i.replace(/_/g, ' ')).join(', ') : 'Abhi koi interest nahi'}
        </Text>
        <Text style={[s.muted, { marginTop: 4 }]}>Pace: {user?.pace ?? '-'}</Text>
      </View>

      {error && <Text style={s.error}>{error}</Text>}

      <Pressable style={[s.cta, (busy || !region) && { opacity: 0.6 }]} onPress={generate} disabled={busy || !region}>
        {busy ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator color="#fff" />
            <Text style={s.ctaText}>Itinerary ban rahi hai...</Text>
          </View>
        ) : (
          <Text style={s.ctaText}>Itinerary banao</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 20, paddingTop: 48, backgroundColor: '#f8fafc', flexGrow: 1 },
  link: { color: '#2563eb', fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', marginTop: 12, marginBottom: 8 },
  label: { fontWeight: '700', color: '#0f172a', marginTop: 18, marginBottom: 8 },
  muted: { color: '#64748b' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { color: '#0f172a', fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, fontWeight: '700' },
  days: { fontSize: 24, fontWeight: '800', minWidth: 30, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  error: { color: '#b91c1c', marginTop: 14 },
  cta: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
