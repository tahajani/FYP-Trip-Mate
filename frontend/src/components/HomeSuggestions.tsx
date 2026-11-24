import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import api from '../services/api';

type Suggestion = { userId: string; name: string; pace: string; score: number; sharedInterests: string[] };
type GroupRow = { id: string; name: string; isOwner: boolean; myStatus: string; acceptedCount: number; pendingCount: number; maxMembers: number };

const msg = (e: any) => e?.response?.data?.message || e?.message || 'Something went wrong';
const label = (s: string) => s.replace(/_/g, ' ');

export default function HomeSuggestions() {
  const router = useRouter();
  const [list, setList] = useState<Suggestion[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]); // groups I own that still have a free seat
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMatches = useCallback(async (groupId: string | null) => {
    const params = groupId ? { limit: 5, groupId } : { limit: 5 };
    const { data } = await api.get('/matches', { params });
    setList(data.suggestions || []);
  }, []);

  // runs every time the home screen gets focus (after login, after coming back, after a refresh)
  const load = useCallback(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/groups');
        const free = (data as GroupRow[]).filter(
          (g) => g.isOwner && g.myStatus === 'accepted' && g.acceptedCount + g.pendingCount < g.maxMembers
        );
        if (!alive) return;
        setGroups(free);
        const keep = free.find((g) => g.id === selectedRef.current);
        const id = keep ? keep.id : free[0]?.id ?? null; // list is sorted by most recent update
        selectedRef.current = id;
        setSelected(id);
        await fetchMatches(id);
      } catch (e) {
        if (alive) setError(msg(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchMatches]);
  useFocusEffect(load);

  const pick = async (id: string) => {
    selectedRef.current = id;
    setSelected(id);
    setLoading(true);
    setError('');
    try { await fetchMatches(id); } catch (e) { setError(msg(e)); } finally { setLoading(false); }
  };

  const group = groups.find((g) => g.id === selected) || null;

  const invite = async (s: Suggestion) => {
    if (!group) return;
    try {
      await api.post(`/groups/${group.id}/invite`, { userId: s.userId });
      setList((l) => l.filter((x) => x.userId !== s.userId));
      setGroups((gs) => gs.map((g) => (g.id === group.id ? { ...g, pendingCount: g.pendingCount + 1 } : g)));
      Alert.alert('Invited', `${s.name} was invited to "${group.name}".`);
    } catch (e) {
      Alert.alert('Could not invite', msg(e));
    }
  };

  return (
    <View style={st.wrap}>
      <Text style={st.title}>Travel companions for you</Text>

      {groups.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {groups.map((g) => (
            <TouchableOpacity key={g.id} onPress={() => pick(g.id)} style={[st.chip, g.id === selected && st.chipOn]}>
              <Text style={[st.chipText, g.id === selected && { color: '#fff' }]}>{g.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {!!group && <Text style={st.muted}>Inviting to: {group.name} ({group.acceptedCount + group.pendingCount}/{group.maxMembers} seats)</Text>}

      {loading && <ActivityIndicator style={{ marginTop: 8 }} />}
      {!loading && !!error && <Text style={st.muted}>{error}</Text>}
      {!loading && !error && list.length === 0 && <Text style={st.muted}>No matching travellers yet.</Text>}

      {list.map((s) => (
        <View key={s.userId} style={st.card}>
          <View style={{ flex: 1 }}>
            <Text style={st.name}>{s.name}  <Text style={st.score}>{Math.round(s.score * 100)}% match</Text></Text>
            <Text style={st.muted}>{s.sharedInterests.map(label).join(', ') || 'similar interests'} · {s.pace} pace</Text>
          </View>
          {group ? (
            <TouchableOpacity style={st.btn} onPress={() => invite(s)}>
              <Text style={st.btnText}>Invite</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      {!loading && !group && list.length > 0 && (
        <TouchableOpacity onPress={() => router.push('/groups/new' as any)}>
          <Text style={st.link}>Create a group (or free a seat) to invite them</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 16, marginHorizontal: 20 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#bfdbfe', marginRight: 8, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', marginTop: 8, backgroundColor: '#fff' },
  name: { fontSize: 16, fontWeight: '600' },
  score: { fontSize: 13, color: '#2e7d32' },
  muted: { color: '#777', fontSize: 13, marginTop: 2 },
  btn: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600' },
  link: { color: '#2563eb', marginTop: 8 },
});