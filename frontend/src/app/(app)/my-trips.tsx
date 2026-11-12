import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import api from '../../services/api';
import { formatDay } from '../../utils/dates';

type TripRow = {
  _id: string;
  startDate?: string;
  endDate?: string;
  dayCount?: number;
  travelTimeSource?: string;
  regionSlug?: string;
  days: { places: unknown[] }[];
};

export default function MyTripsScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pull = false) => {
    pull ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/itineraries'); // newest first
      setTrips(data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Trips load nahi huin');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // reload every time the screen is shown (after saving or creating a trip)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const confirmDelete = (tripId: string) => {
  const doDelete = async () => {
    setDeletingId(tripId);
    setError(null);
    try {
      await api.delete(`/itineraries/${tripId}`);
      setTrips((prev) => prev.filter((t) => t._id !== tripId));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Delete nahi hui');
    } finally {
      setDeletingId(null);
    }
  };
  if (Platform.OS === 'web') {
    if (window.confirm('Ye trip hamesha ke liye delete ho jayegi. Pakka?')) doDelete();
  } else {
    Alert.alert('Trip delete karo?', 'Ye wapas nahi aayegi.', [
      { text: 'Nahi', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  }
};

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} />;

  return (
    <View style={s.container}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Text style={s.link}>← Wapas</Text>
      </Pressable>
      <Text style={s.title}>Meri trips</Text>
      {error && <Text style={s.error}>{error}</Text>}

      <FlatList
        data={trips}
        keyExtractor={(t) => t._id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
  <View style={{ marginTop: 40, alignItems: 'center' }}>
    {!error && (
      <>
        <Text style={s.muted}>Abhi koi trip nahi hai.</Text>
        <Pressable style={s.cta} onPress={() => router.push('/plan-trip' as any)}>
          <Text style={s.ctaText}>Nayi trip banao</Text>
        </Pressable>
      </>
    )}
  </View>
}
        renderItem={({ item }) => {
          const dayCount = item.dayCount ?? item.days.length;
          const places = item.days.reduce((a, d) => a + d.places.length, 0);
          const title =
            item.startDate && item.endDate
              ? `${formatDay(item.startDate)} se ${formatDay(item.endDate)}`
              : `${dayCount} din ki trip`;
          return (
            <Pressable style={s.card} onPress={() => router.push(`/itinerary/${item._id}` as any)}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{title}</Text>
                <Text style={s.meta}>
                  {dayCount} din · {places} jagah
                  {item.regionSlug ? ` · ${item.regionSlug}` : ''}
                </Text>
              </View>
              {item.travelTimeSource === 'osrm' ? (
                <Text style={[s.badge, s.badgeOk]}>Sadak</Text>
              ) : item.travelTimeSource === 'haversine' ? (
                <Text style={[s.badge, s.badgeWarn]}>Andaza</Text>
              ) : null}
              <Pressable onPress={() => confirmDelete(item._id)} disabled={deletingId === item._id} hitSlop={8}>
                <Text style={s.delText}>{deletingId === item._id ? '...' : 'Delete'}</Text>
            </Pressable>
            </Pressable>
          );
        }}
      />

      {trips.length > 0 && (
        <Pressable style={s.cta} onPress={() => router.push('/plan-trip' as any)}>
          <Text style={s.ctaText}>+ Nayi trip</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 48, backgroundColor: '#f8fafc' },
  link: { color: '#2563eb', fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', marginTop: 12, marginBottom: 12 },
  muted: { color: '#64748b' },
  error: { color: '#b91c1c', marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 10, gap: 12 },
  cardTitle: { fontWeight: '800', color: '#0f172a' },
  meta: { color: '#64748b', fontSize: 12, marginTop: 4 },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  badgeOk: { backgroundColor: '#dcfce7', color: '#15803d' },
  badgeWarn: { backgroundColor: '#fef3c7', color: '#92400e' },
  delText: { color: '#b91c1c', fontWeight: '700', fontSize: 12 },
  cta: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', marginTop: 16 },
  ctaText: { color: '#fff', fontWeight: '800' },
});