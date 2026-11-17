import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import api from '../services/api';
import { confirmAction, errMsg, ui } from './ui';

type Trip = { _id: string; regionSlug?: string; dayCount?: number; startDate?: string; type?: string };

const pretty = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Trip');

export default function TripsSection() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      // NOT VERIFIED: use the same call that my-trips.tsx makes today (path and response shape)
      const { data } = await api.get('/itineraries');
      setTrips(Array.isArray(data) ? data : data?.itineraries ?? []);
    } catch (e) {
      setError(errMsg(e, 'Could not load your trips'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const remove = (t: Trip) =>
    confirmAction('Delete trip', `Delete your ${pretty(t.regionSlug)} trip?`, async () => {
      setDeletingId(t._id);
      try {
        await api.delete(`/itineraries/${t._id}`);
        setTrips((prev) => prev.filter((x) => x._id !== t._id));
      } catch (e) {
        setError(errMsg(e, 'Could not delete the trip'));
      } finally {
        setDeletingId(null);
      }
    });

  if (loading) return <ActivityIndicator style={{ marginVertical: 24 }} />;

  return (
    <View>
      {error && <Text style={ui.error}>{error}</Text>}

      {trips.length === 0 && !error && (
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Text style={{ fontSize: 40 }}>🗺️</Text>
          <Text style={ui.cardTitle}>No trips yet</Text>
          <Text style={[ui.muted, { textAlign: 'center', marginTop: 4 }]}>
            Tap "Plan a trip" to create your first itinerary.
          </Text>
        </View>
      )}

      {trips.map((t) => (
        <Pressable key={t._id} style={ui.card} onPress={() => router.push(`/itinerary/${t._id}` as any)}>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={ui.cardTitle}>{pretty(t.regionSlug)}</Text>
              <Text style={ui.muted}>
                {t.dayCount ?? '?'} day{t.dayCount === 1 ? '' : 's'}
                {t.startDate ? ` · ${t.startDate}` : ''}
              </Text>
              {t.type === 'group' && <Text style={[ui.badge, { alignSelf: 'flex-start', marginTop: 6 }]}>Group trip</Text>}
            </View>
            <Pressable onPress={() => remove(t)} disabled={deletingId === t._id} hitSlop={8}>
              <Text style={{ color: '#b91c1c', fontWeight: '700' }}>{deletingId === t._id ? '...' : 'Delete'}</Text>
            </Pressable>
          </View>
        </Pressable>
      ))}
    </View>
  );
}