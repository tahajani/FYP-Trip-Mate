import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import api from '../services/api';
import { errMsg, ui } from './ui';

type Msg = { role: 'user' | 'assistant'; content: string };

// Shows this account's saved conversation and sends new messages. groupId is optional (a group page passes it).
export default function AssistantChat({ groupId }: { groupId?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    let alive = true;
    api.get('/agent/history')
      .then(({ data }) => { if (alive) setMessages((data.messages || []).map((m: any) => ({ role: m.role, content: m.content }))); })
      .catch(() => {}) // an empty chat is fine if history cannot be loaded
      .finally(() => { if (alive) setLoadingHistory(false); });
    return () => { alive = false; };
  }, []);

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

  const clear = async () => {
    try {
      await api.delete('/agent/history');
      setMessages([]);
    } catch (e) {
      setError(errMsg(e, 'Could not clear the chat'));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {messages.length > 0 && (
        <Pressable onPress={clear} style={{ alignSelf: 'flex-end', paddingVertical: 4 }}>
          <Text style={ui.link}>Clear chat</Text>
        </Pressable>
      )}
      {error && <Text style={ui.error}>{error}</Text>}
      {loadingHistory && <ActivityIndicator style={{ marginVertical: 8 }} />}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          !loadingHistory ? (
            <Text style={ui.muted}>
              Try: "Suggest food places in Lahore", "What is the weather in Karachi tomorrow?", "Who can I travel with?"
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[s.bubble, item.role === 'user' ? s.mine : s.theirs]}>
            <Text style={item.role === 'user' ? s.mineText : s.theirsText}>{item.content}</Text>
          </View>
        )}
      />
      {busy && <ActivityIndicator style={{ marginVertical: 6 }} />}

      <View style={[ui.row, { paddingTop: 8 }]}>
        <TextInput
          style={[ui.input, { flex: 1, marginBottom: 0 }]}
          value={text}
          onChangeText={setText}
          placeholder="Ask the assistant..."
          maxLength={6500}
          onSubmitEditing={send}
          returnKeyType="send"
        />
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