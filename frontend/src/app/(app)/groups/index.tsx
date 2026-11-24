import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import api from '../../../services/api';
import { errMsg, ui } from '../../../components/ui';

type GroupRow = { id: string; name: string; myStatus: string; isOwner: boolean; acceptedCount: number; pendingCount: number; maxMembers: number };

export default function GroupsScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data } = await api.get('/groups');
      setGroups(data);
    } catch (e) {
      setError(errMsg(e, 'Could not load your groups'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // join with an invite code
  const join = async () => {
    const c = code.trim().toLowerCase();
    if (!c) return;
    setJoining(true);
    setError(null);
    try {
      const { data } = await api.post('/groups/join', { code: c });
      setCode('');
      if (data?.groupId) router.push(`/group-chat/${data.groupId}` as any);
      else await load();
    } catch (e) {
      setError(errMsg(e, 'Could not join the group'));
    } finally {
      setJoining(false);
    }
  };

  // accept an invitation shown on a card, then go straight into the group chat
  const accept = async (g: GroupRow) => {
    setBusyId(g.id);
    setError(null);
    try {
      await api.post(`/groups/${g.id}/accept`);
      router.push(`/group-chat/${g.id}` as any);
    } catch (e) {
      setError(errMsg(e, 'Could not join the group'));
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (g: GroupRow) => {
    setBusyId(g.id);
    setError(null);
    try {
      await api.post(`/groups/${g.id}/decline`);
      await load();
    } catch (e) {
      setError(errMsg(e, 'Could not decline the invitation'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} />;

  return (
    <View style={ui.container}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Text style={ui.link}>← Back</Text>
      </Pressable>
      <Text style={ui.title}>My groups</Text>
      {error && <Text style={ui.error}>{error}</Text>}

      <View style={ui.row}>
        <TextInput
          style={[ui.input, { flex: 1, marginBottom: 0 }]}
          value={code}
          onChangeText={setCode}
          placeholder="Invite code"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={[ui.btn, (!code.trim() || joining) && { opacity: 0.5 }]} onPress={join} disabled={!code.trim() || joining}>
          <Text style={ui.btnText}>Join</Text>
        </Pressable>
      </View>

      <Pressable style={[ui.btnGhost, { marginVertical: 12 }]} onPress={() => router.push('/groups/new' as any)}>
        <Text style={ui.btnGhostText}>+ Create a group</Text>
      </Pressable>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        ListEmptyComponent={<Text style={ui.muted}>You are not in any group yet. Create one or join with an invite code.</Text>}
        renderItem={({ item }) => {
          const invited = item.myStatus === 'pending';
          const busy = busyId === item.id;
          return (
            <Pressable style={ui.card} onPress={() => router.push(`/groups/${item.id}` as any)}>
              <Text style={ui.cardTitle}>{item.name}</Text>
              <Text style={ui.muted}>
                {item.acceptedCount}
                {item.maxMembers ? ` / ${item.maxMembers}` : ''} members
              </Text>

              {invited ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={[ui.badge, { alignSelf: 'flex-start', marginBottom: 8 }]}>You are invited to this group</Text>
                  <View style={ui.row}>
                    <Pressable style={[ui.btn, busy && { opacity: 0.5 }]} onPress={() => accept(item)} disabled={busy}>
                      <Text style={ui.btnText}>{busy ? 'Please wait...' : 'Join'}</Text>
                    </Pressable>
                    <Pressable style={[ui.btnGhost, busy && { opacity: 0.5 }]} onPress={() => decline(item)} disabled={busy}>
                      <Text style={ui.btnGhostText}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={[ui.row, { marginTop: 10 }]}>
                  <Pressable style={ui.btn} onPress={() => router.push(`/group-chat/${item.id}` as any)}>
                    <Text style={ui.btnText}>Chat</Text>
                  </Pressable>
                  <Pressable style={ui.btnGhost} onPress={() => router.push(`/group-itinerary/${item.id}` as any)}>
                    <Text style={ui.btnGhostText}>Trip</Text>
                  </Pressable>
                  {item.isOwner && item.pendingCount > 0 && <Text style={ui.badge}>{item.pendingCount} pending</Text>}
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
