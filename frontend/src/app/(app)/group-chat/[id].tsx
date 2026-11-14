import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../services/api';
import { getSocket } from '../../../services/socket';
import { getAuthToken, userIdFromToken } from '../../../services/authToken';

type Msg = { id: string; senderId: string; text: string; createdAt?: string };

export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);

  // 1) token + chat history
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await getAuthToken();
        if (!t) throw new Error('Login token nahi mila');
        const { data } = await api.get(`/groups/${id}/messages?limit=50`);
        if (!alive) return;
        setToken(t);
        setMessages(data);
      } catch (e: any) {
        if (alive) setError(e?.response?.data?.message ?? e?.message ?? 'Chat load nahi hui');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  // 2) live messages (join again after every reconnect, rooms are lost when the connection drops)
  useEffect(() => {
    if (!token || !id) return;
    const s = getSocket(token);
    const join = () =>
      s.emit('group:join', { groupId: id }, (r: any) => {
        if (!r?.ok) setError(r?.error ?? 'Group join nahi hua');
      });
    const onMsg = (m: Msg) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    const onFail = () => setError('Server se connection nahi bana');

    if (s.connected) join();
    s.on('connect', join);
    s.on('connect_error', onFail);
    s.on('group:message', onMsg);
    return () => {
      s.off('connect', join);
      s.off('connect_error', onFail);
      s.off('group:message', onMsg);
      s.emit('group:leave', { groupId: id });
    };
  }, [id, token]);

  const send = () => {
    const clean = text.trim();
    if (!clean || !token) return;
    setError(null);
    getSocket(token).emit('group:message', { groupId: id, text: clean }, (r: any) => {
      if (!r?.ok) setError(r?.error ?? 'Message nahi gaya');
      else setText('');
    });
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} />;
  const myId = token ? userIdFromToken(token) : null;

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Text style={s.link}>← Wapas</Text>
      </Pressable>
      <Text style={s.title}>Group chat</Text>
      {error && <Text style={s.error}>{error}</Text>}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={s.muted}>Abhi koi message nahi. Pehla message bhejo.</Text>}
        renderItem={({ item }) => {
          const mine = !!myId && item.senderId === myId;
          return (
            <View style={[s.bubble, mine ? s.mine : s.theirs]}>
              {!mine && <Text style={s.sender}>{item.senderId.slice(-4)}</Text>}
              <Text style={mine ? s.mineText : s.theirsText}>{item.text}</Text>
            </View>
          );
        }}
      />

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Message likho..."
          maxLength={1000}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable style={[s.sendBtn, !text.trim() && { opacity: 0.5 }]} onPress={send} disabled={!text.trim()}>
          <Text style={s.sendText}>Bhejo</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 48, backgroundColor: '#f8fafc' },
  link: { color: '#2563eb', fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', marginVertical: 8 },
  muted: { color: '#64748b', textAlign: 'center', marginTop: 24 },
  error: { color: '#b91c1c', marginBottom: 6 },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginVertical: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#2563eb' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  mineText: { color: '#fff' },
  theirsText: { color: '#0f172a' },
  sender: { fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 2 },
  inputRow: { flexDirection: 'row', gap: 8, paddingTop: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  sendBtn: { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '800' },
});