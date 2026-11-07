import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import api from '../services/api';
import { SearchResult } from '../types/trip';

type Props = {
  lat: number; // centre of the trip, so results stay near it
  lon: number;
  onPick: (r: SearchResult) => void;
  onClose: () => void;
};

const REASONS: Record<string, string> = {
  limit: 'Nominatim ki limit lag gayi',
  error: 'Nominatim se jawab nahi aya',
  no_results: 'Nominatim ko kuch nahi mila',
};

export default function PlaceSearch({ lat, lon, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Searches only on button press / Enter (Nominatim policy: no search-as-you-type)
  const search = async () => {
    if (q.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const { data } = await api.get('/places/search', { params: { q: q.trim(), lat, lon } });
      setResults(data.results);
      if (data.source === 'seeded') {
        setInfo(`${REASONS[data.fallbackReason] ?? 'Nominatim available nahi'}, isliye saved places dikh rahi hain.`);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Search nahi hui');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.box}>
      <View style={s.row}>
        <TextInput
          style={s.input}
          placeholder="Jagah ka naam likho"
          value={q}
          onChangeText={setQ}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <Pressable style={s.btn} onPress={search} disabled={loading}>
          <Text style={s.btnText}>Dhoondo</Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 10 }} />}
      {info && <Text style={s.info}>{info}</Text>}
      {error && <Text style={s.error}>{error}</Text>}
      {results && results.length === 0 && !loading && <Text style={s.info}>Kuch nahi mila.</Text>}

      {results?.map((r, i) => (
        <Pressable key={`${r.name}-${i}`} style={s.item} onPress={() => onPick(r)}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{r.name}</Text>
            <Text style={s.meta} numberOfLines={1}>
              {r.kind.replace(/_/g, ' ')}
              {r.displayName ? ` · ${r.displayName}` : ''}
            </Text>
          </View>
          <Text style={[s.badge, r.source === 'nominatim' ? s.badgeNom : s.badgeSeed]}>
            {r.source === 'nominatim' ? 'Nominatim' : 'Saved'}
          </Text>
        </Pressable>
      ))}

      <Pressable onPress={onClose} style={{ marginTop: 10 }}>
        <Text style={s.close}>Band karo</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  btn: { backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  info: { color: '#92400e', marginTop: 8, fontSize: 13 },
  error: { color: '#b91c1c', marginTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 8 },
  name: { fontWeight: '600', color: '#111827' },
  meta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  badgeNom: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  badgeSeed: { backgroundColor: '#fef3c7', color: '#92400e' },
  close: { color: '#2563eb', fontWeight: '600' },
});
