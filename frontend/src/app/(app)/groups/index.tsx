import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import api from '../../../services/api';
import { errMsg, ui } from '../../../components/ui';

type GroupRow = { _id: string; name: string; members?: { status: string }[]; maxMembers?: number };

export default function GroupsScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

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

  const join = async () => {
    const c = code.trim().toLowerCase();
    if (!c) return;
    setJoining(true);
    setError(null);
    try {
      const { data } = await api.post('/groups/join', { code: c });
      setCode('');
      if (data?.groupId) router.push(`/groups/${data.groupId}` as any);
      else await load();
    } catch (e) {
      setError(errMsg(e, 'Could not join the group'));
    } finally {
      setJoining(false);
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

      <Pressable style={[ui.btnGhost, { marginVertical: 12 }]} onPress={() => router.push('/groups/new')}>
        <Text style={ui.btnGhostText}>+ Create a group</Text>
      </Pressable>

      <FlatList
        data={groups}
        keyExtractor={(g) => g._id}
        ListEmptyComponent={<Text style={ui.muted}>You are not in any group yet. Create one or join with an invite code.</Text>}
        renderItem={({ item }) => {
          const accepted = item.members?.filter((m) => m.status === 'accepted').length ?? 0;
          const pending = item.members?.some((m) => m.status === 'pending');
          return (
            <Pressable style={ui.card} onPress={() => router.push(`/groups/${item._id}`)}>
              <Text style={ui.cardTitle}>{item.name}</Text>
              <Text style={ui.muted}>
                {accepted}
                {item.maxMembers ? ` / ${item.maxMembers}` : ''} members
              </Text>
              {pending && <Text style={[ui.badge, { alignSelf: 'flex-start', marginTop: 6 }]}>Has pending invites</Text>}
            </Pressable>
          );
        }}
      />
    </View>
  );
}