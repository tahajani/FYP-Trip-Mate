import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import api from '../services/api';
import { errMsg, ui } from './ui';

type Suggestion = { userId: string; name?: string; pace?: string; score: number; sharedInterests: string[] };
const pretty = (s: string) => s.replace(/_/g, ' ');

// Compatible companions (TF-IDF >= 0.6) for the group owner, with a one-tap invite.
export default function SuggestedCompanions({ groupId, disabled, onInvited }: { groupId: string; disabled?: boolean; onInvited: () => void }) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data } = await api.get(`/matches?groupId=${groupId}`);
      setItems(data.suggestions ?? []);
    } catch (e) {
      setError(errMsg(e, 'Could not load suggestions'));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const invite = async (s: Suggestion) => {
    setBusyId(s.userId);
    setError(null);
    try {
      await api.post(`/groups/${groupId}/invite`, { userId: s.userId });
      setItems((prev) => prev.filter((x) => x.userId !== s.userId));
      onInvited();
    } catch (e) {
      setError(errMsg(e, 'Could not send the invitation'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View>
      <Text style={ui.h2}>Suggested companions</Text>
      {loading && <ActivityIndicator />}
      {error && <Text style={ui.error}>{error}</Text>}
      {!loading && !error && items.length === 0 && (
        <Text style={ui.muted}>No compatible users found yet (a match needs a similarity of at least 60%).</Text>
      )}
      {items.map((s) => (
        <View key={s.userId} style={[ui.card, ui.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={ui.cardTitle}>{s.name || 'Traveler'} · {Math.round(s.score * 100)}% match</Text>
            <Text style={ui.muted}>
              {s.sharedInterests.map(pretty).join(', ')}
              {s.pace ? ` · ${s.pace} pace` : ''}
            </Text>
          </View>
          <Pressable style={[ui.btn, (disabled || busyId === s.userId) && { opacity: 0.5 }]} disabled={disabled || busyId === s.userId} onPress={() => invite(s)}>
            <Text style={ui.btnText}>{busyId === s.userId ? '...' : 'Invite'}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}