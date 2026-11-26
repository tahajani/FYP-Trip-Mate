import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import api from '../services/api';
import { errMsg } from './ui';

type Option = { id: string; label: string; votes: number };
type Poll = {
  id: string; type: 'fairness' | 'custom'; question: string; note: string; status: 'open' | 'closed';
  options: Option[]; totalVotes: number; myVote: string | null; winner: string | null;
};

// compact: only open polls and no "new poll" form (used inside the chat screen)
export default function GroupPolls({ groupId, compact }: { groupId: string; compact?: boolean }) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [question, setQuestion] = useState('');
  const [optionsText, setOptionsText] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/groups/${groupId}/polls`);
      setPolls(data.polls || []);
      setIsOwner(!!data.isOwner);
    } catch {
      /* not a member yet, or a temporary error: show nothing */
    }
  }, [groupId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const replace = (p: Poll) => setPolls((list) => list.map((x) => (x.id === p.id ? p : x)));

  const vote = async (poll: Poll, optionId: string) => {
    setBusy(poll.id);
    setError(null);
    try {
      const { data } = await api.post(`/groups/${groupId}/polls/${poll.id}/vote`, { optionId });
      replace(data);
    } catch (e) {
      setError(errMsg(e, 'Could not save your vote'));
    } finally {
      setBusy(null);
    }
  };

  const closePoll = async (poll: Poll) => {
    setBusy(poll.id);
    setError(null);
    try {
      const { data } = await api.post(`/groups/${groupId}/polls/${poll.id}/close`);
      replace(data);
    } catch (e) {
      setError(errMsg(e, 'Could not close the poll'));
    } finally {
      setBusy(null);
    }
  };

  const createPoll = async () => {
    setError(null);
    try {
      const options = optionsText.split(',').map((o) => o.trim()).filter(Boolean);
      await api.post(`/groups/${groupId}/polls`, { question: question.trim(), options });
      setQuestion('');
      setOptionsText('');
      setShowNew(false);
      await load();
    } catch (e) {
      setError(errMsg(e, 'Could not create the poll'));
    }
  };

  const shown = compact ? polls.filter((p) => p.status === 'open') : polls;
  const canCreate = isOwner && !compact;
  if (shown.length === 0 && !canCreate) return null;

  return (
    <View style={s.wrap}>
      <Text style={s.h2}>Group polls</Text>
      {error && <Text style={s.error}>{error}</Text>}

      {shown.map((p) => {
        const open = p.status === 'open';
        const winnerLabel = p.options.find((o) => o.id === p.winner)?.label;
        return (
          <View key={p.id} style={s.card}>
            <Text style={s.question}>{p.question}</Text>
            {!!p.note && <Text style={s.muted}>{p.note}</Text>}

            {p.options.map((o) => {
              const pct = p.totalVotes ? (o.votes / p.totalVotes) * 100 : 0;
              const mine = p.myVote === o.id;
              return (
                <Pressable
                  key={o.id}
                  style={[s.option, mine && s.optionMine, p.winner === o.id && s.optionWin]}
                  onPress={() => open && busy !== p.id && vote(p, o.id)}
                  disabled={!open || busy === p.id}
                >
                  <View style={[s.fill, { width: `${pct}%` }]} />
                  <Text style={s.optionText}>{mine ? '✓ ' : ''}{o.label}</Text>
                  <Text style={s.count}>{o.votes}</Text>
                </Pressable>
              );
            })}

            <View style={s.footer}>
              <Text style={s.muted}>
                {open ? `Open · ${p.totalVotes} vote${p.totalVotes === 1 ? '' : 's'} so far` : winnerLabel ? `Closed · result: ${winnerLabel}` : 'Closed · no clear winner'}
              </Text>
              {open && isOwner && (
                <Pressable onPress={() => closePoll(p)} disabled={busy === p.id}>
                  <Text style={s.link}>Close poll</Text>
                </Pressable>
              )}
            </View>

            {!open && p.type === 'fairness' && p.winner === 'regenerate' && (
              <Text style={s.hint}>The group asked for a new plan. The owner can generate one from the group page.</Text>
            )}
          </View>
        );
      })}

      {canCreate && (
        showNew ? (
          <View style={s.card}>
            <TextInput style={s.input} value={question} onChangeText={setQuestion} placeholder="Question, for example: Where should we eat?" maxLength={200} />
            <TextInput style={s.input} value={optionsText} onChangeText={setOptionsText} placeholder="Options separated by commas (2 to 4)" maxLength={260} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable style={s.btn} onPress={createPoll}><Text style={s.btnText}>Start poll</Text></Pressable>
              <Pressable onPress={() => setShowNew(false)} style={{ justifyContent: 'center' }}><Text style={s.link}>Cancel</Text></Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setShowNew(true)}><Text style={s.link}>+ Start a poll</Text></Pressable>
        )
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 14 },
  h2: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  card: { padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  question: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  muted: { color: '#64748b', fontSize: 12, marginTop: 2 },
  hint: { color: '#92400e', fontSize: 12, marginTop: 6 },
  error: { color: '#b91c1c', marginBottom: 6 },
  option: { marginTop: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden' },
  optionMine: { borderColor: '#2563eb' },
  optionWin: { borderColor: '#16a34a' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#dbeafe' },
  optionText: { color: '#0f172a', fontWeight: '600', flexShrink: 1 },
  count: { color: '#475569', fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  link: { color: '#2563eb', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, backgroundColor: '#fff' },
  btn: { backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '800' },
});