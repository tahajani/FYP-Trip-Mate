import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../services/api';
import { getAuthToken, userIdFromToken } from '../../../services/authToken';
import { confirmAction, errMsg, ui } from '../../../components/ui';

type Member = {
  userId: string | { _id: string; name?: string; email?: string }; // populated or plain id (NOT VERIFIED which one the API returns)
  status: 'pending' | 'accepted' | 'declined';
};
type Group = {
  _id: string; name: string; ownerId: string | { _id: string }; members: Member[]; maxMembers: number;
  inviteCode?: string; regionSlug?: string; days?: number; latestItineraryId?: string | null;
};

const uid = (x: any) => String(typeof x === 'object' && x ? x._id : x);
const label = (m: Member) =>
  typeof m.userId === 'object' ? m.userId.name || m.userId.email || uid(m.userId).slice(-6) : String(m.userId).slice(-6);

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [days, setDays] = useState('3');
  const [region, setRegion] = useState('islamabad'); // change to your default region slug
  const [startDate, setStartDate] = useState(''); // YYYY-MM-DD, optional

  const load = useCallback(async () => {
    try {
      setError(null);
      const t = await getAuthToken();
      setMyId(t ? userIdFromToken(t) : null);
      const { data } = await api.get(`/groups/${id}`);
      setGroup(data);
      if (data.regionSlug) setRegion(data.regionSlug);
      if (data.days) setDays(String(data.days));
    } catch (e) {
      setError(errMsg(e, 'Could not load the group'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // runs one action, then reloads the group
  const act = async (fn: () => Promise<any>, ok?: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      if (ok) setInfo(ok);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} />;
  if (!group) {
    return (
      <View style={ui.container}>
        <Pressable onPress={() => router.back()}><Text style={ui.link}>← Back</Text></Pressable>
        <Text style={ui.error}>{error ?? 'Group not found'}</Text>
      </View>
    );
  }

  const me = group.members.find((m) => uid(m.userId) === myId);
  const isOwner = !!myId && uid(group.ownerId) === myId;
  const accepted = group.members.filter((m) => m.status === 'accepted');
  const pending = group.members.filter((m) => m.status === 'pending');
  const seatsUsed = accepted.length + pending.length;
  const canGenerate = isOwner && accepted.length >= 2;

  const leaveGroup = () =>
    confirmAction('Leave group', 'Do you really want to leave this group?', () =>
      act(async () => {
        await api.post(`/groups/${id}/leave`);
        router.replace('/groups');
      })
    );

  const generate = () =>
    act(async () => {
      const n = parseInt(days, 10);
      if (!Number.isInteger(n) || n < 1 || n > 14) throw new Error('Days must be between 1 and 14');
      // NOT VERIFIED: the body fields must match what POST /groups/:id/itinerary reads in groupRoutes.js
      const body: any = { regionSlug: region.trim(), days: n };
      if (startDate.trim()) body.startDate = startDate.trim();
      await api.post(`/groups/${id}/itinerary`, body);
    }, 'Group itinerary generated.');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={{ padding: 20, paddingTop: 48 }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/groups'))}>
        <Text style={ui.link}>← Back</Text>
      </Pressable>
      <Text style={ui.title}>{group.name}</Text>
      {error && <Text style={ui.error}>{error}</Text>}
      {info && <Text style={{ color: '#15803d', marginBottom: 8 }}>{info}</Text>}

      {/* pending invite for me */}
      {me?.status === 'pending' && (
        <View style={ui.card}>
          <Text style={ui.cardTitle}>You have been invited to this group</Text>
          <View style={[ui.row, { marginTop: 10 }]}>
            <Pressable style={[ui.btn, { flex: 1 }]} disabled={busy} onPress={() => act(() => api.post(`/groups/${id}/accept`))}>
              <Text style={ui.btnText}>Accept</Text>
            </Pressable>
            <Pressable style={[ui.btnDanger, { flex: 1 }]} disabled={busy} onPress={() => act(async () => { await api.post(`/groups/${id}/decline`); router.replace('/groups'); })}>
              <Text style={ui.btnDangerText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={ui.h2}>Members ({accepted.length} / {group.maxMembers})</Text>
      {accepted.map((m) => (
        <View key={uid(m.userId)} style={[ui.card, ui.row, { justifyContent: 'space-between' }]}>
          <Text style={ui.cardTitle}>{label(m)}</Text>
          {uid(m.userId) === uid(group.ownerId) && <Text style={ui.badge}>Owner</Text>}
        </View>
      ))}
      {pending.length > 0 && (
        <>
          <Text style={ui.h2}>Pending invites</Text>
          {pending.map((m) => (
            <View key={uid(m.userId)} style={[ui.card, ui.row, { justifyContent: 'space-between' }]}>
              <Text style={ui.cardTitle}>{label(m)}</Text>
              <Text style={ui.badge}>Pending</Text>
            </View>
          ))}
        </>
      )}

      {/* owner tools */}
      {isOwner && (
        <>
          <Text style={ui.h2}>Invite a friend</Text>
          {group.inviteCode && (
            <Text style={ui.muted} selectable>
              Invite code: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{group.inviteCode}</Text> (share it so friends can join directly)
            </Text>
          )}
          <View style={[ui.row, { marginTop: 8 }]}>
            <TextInput
              style={[ui.input, { flex: 1, marginBottom: 0 }]}
              value={email}
              onChangeText={setEmail}
              placeholder="Friend's email"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Pressable
              style={[ui.btn, (!email.trim() || busy || seatsUsed >= group.maxMembers) && { opacity: 0.5 }]}
              disabled={!email.trim() || busy || seatsUsed >= group.maxMembers}
              onPress={() => act(async () => { await api.post(`/groups/${id}/invite`, { email: email.trim() }); setEmail(''); }, 'Invitation sent.')}
            >
              <Text style={ui.btnText}>Invite</Text>
            </Pressable>
          </View>
          {seatsUsed >= group.maxMembers && <Text style={ui.muted}>The group is full (pending invites hold a seat).</Text>}
        </>
      )}

      {/* itinerary */}
      <Text style={ui.h2}>Group itinerary</Text>
      {group.latestItineraryId ? (
        <Pressable style={[ui.btn, { marginBottom: 10 }]} onPress={() => router.push(`/itinerary/${group.latestItineraryId}`)}>
          <Text style={ui.btnText}>View latest itinerary</Text>
        </Pressable>
      ) : (
        <Text style={ui.muted}>No itinerary has been generated yet.</Text>
      )}

      {isOwner ? (
        <View style={{ marginTop: 8 }}>
          <TextInput style={ui.input} value={region} onChangeText={setRegion} placeholder="Region (e.g. islamabad)" autoCapitalize="none" />
          <TextInput style={ui.input} value={days} onChangeText={setDays} placeholder="Number of days (1-14)" keyboardType="number-pad" />
          <TextInput style={ui.input} value={startDate} onChangeText={setStartDate} placeholder="Start date YYYY-MM-DD (optional)" autoCapitalize="none" />
          <Pressable style={[ui.btnGhost, (!canGenerate || busy) && { opacity: 0.5 }]} disabled={!canGenerate || busy} onPress={generate}>
            <Text style={ui.btnGhostText}>{busy ? 'Working...' : group.latestItineraryId ? 'Generate a new itinerary' : 'Generate itinerary'}</Text>
          </Pressable>
          {!canGenerate && <Text style={ui.muted}>At least 2 members must accept before an itinerary can be generated.</Text>}
        </View>
      ) : (
        <Text style={ui.muted}>Only the group owner can generate an itinerary.</Text>
      )}

      {/* chat + leave */}
      {me?.status === 'accepted' && (
        <>
          <Text style={ui.h2}>Chat</Text>
          <Pressable style={ui.btn} onPress={() => router.push(`/group-chat/${id}`)}>
            <Text style={ui.btnText}>Open group chat</Text>
          </Pressable>
          <Pressable style={[ui.btnDanger, { marginTop: 24 }]} disabled={busy} onPress={leaveGroup}>
            <Text style={ui.btnDangerText}>Leave group</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}