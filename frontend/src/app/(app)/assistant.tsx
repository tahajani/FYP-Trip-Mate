import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../services/api';
import { errMsg, ui } from '../../components/ui';

type Msg = { role: 'user' | 'assistant'; content: string };

// Open it as /assistant, or /assistant?groupId=<id> from a group page (then "why did we get these places?" works).
export default function AssistantScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);

  const send = async () => {
    const clean = text.trim();
    if (!clean || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: clean }];
    setMessages(next);
    setText('');
    setError(null);
    setBusy(true);
    try {
      // only the last 10 turns are sent; the server allows at most 20
      const { data } = await api.post('/agent/chat', { messages: next.slice(-10), groupId });
      setMessages([...next, { role: 'assistant', content: data.reply || '(no reply)' }]);
    } catch (e) {
      setError(errMsg(e, 'The assistant is unavailable right now'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={ui.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))}>
        <Text style={ui.link}>← Back</Text>
      </Pressable>
      <Text style={ui.title}>TripMate assistant</Text>
      {error && <Text style={ui.error}>{error}</Text>}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={ui.muted}>
            Try: "Suggest food places in Lahore", "What is the weather in Karachi tomorrow?"{groupId ? ' or "Why did we get these places?"' : ''}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[s.bubble, item.role === 'user' ? s.mine : s.theirs]}>
            <Text style={item.role === 'user' ? s.mineText : s.theirsText}>{item.content}</Text>
          </View>
        )}
      />
      {busy && <ActivityIndicator style={{ marginVertical: 6 }} />}

      <View style={[ui.row, { paddingTop: 8 }]}>
        <TextInput style={[ui.input, { flex: 1, marginBottom: 0 }]} value={text} onChangeText={setText} placeholder="Ask the assistant..." maxLength={1000} onSubmitEditing={send} returnKeyType="send" />
        <Pressable style={[ui.btn, (!text.trim() || busy) && { opacity: 0.5 }]} onPress={send} disabled={!text.trim() || busy}>
          <Text style={ui.btnText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginVertical: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#2563eb' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  mineText: { color: '#fff' },
  theirsText: { color: '#0f172a' },
});