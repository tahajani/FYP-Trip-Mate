import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { INTERESTS, PACES } from '../../constants/interests';
import { colors } from '../../components/auth-styles';

export default function Onboarding() {
  const { user, updateProfile } = useAuth();
  const router = useRouter();
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);
  const [pace, setPace] = useState<string>(user?.pace ?? 'moderate');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggle = (key: string) =>
    setInterests((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const onSave = async () => {
    if (interests.length === 0) return setError('Kam az kam ek interest chuno');
    setError('');
    setLoading(true);
    try {
      await updateProfile(interests, pace);
      router.replace('/');
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Save nahi hua');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.container}>
      <Text style={s.title}>Tumhe kya pasand hai?</Text>
      <Text style={s.sub}>Jo pasand ho wo chuno, hum usi hisaab se jagahein suggest karenge.</Text>

      <View style={s.grid}>
        {INTERESTS.map((i) => {
          const on = interests.includes(i.key);
          return (
            <Pressable key={i.key} onPress={() => toggle(i.key)} style={[s.chip, on && s.chipOn]}>
              <Text style={s.chipIcon}>{i.icon}</Text>
              <Text style={[s.chipText, on && s.chipTextOn]}>{i.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.section}>Tumhari travel pace?</Text>
      {PACES.map((p) => (
        <Pressable key={p.key} onPress={() => setPace(p.key)} style={[s.pace, pace === p.key && s.paceOn]}>
          <Text style={[s.paceTitle, pace === p.key && { color: colors.primary }]}>{p.label}</Text>
          <Text style={s.paceDesc}>{p.desc}</Text>
        </Pressable>
      ))}

      {!!error && <Text style={s.error}>{error}</Text>}

      <Pressable style={[s.button, loading && { opacity: 0.6 }]} onPress={onSave} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Save & Continue</Text>}
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 24, paddingTop: 48, gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  sub: { color: colors.muted, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff' },
  chipOn: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  chipIcon: { fontSize: 16 },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextOn: { color: colors.primary },
  section: { fontSize: 18, fontWeight: '700', marginTop: 16, color: colors.text },
  pace: { padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff' },
  paceOn: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  paceTitle: { fontWeight: '700', fontSize: 16, color: colors.text },
  paceDesc: { color: colors.muted, marginTop: 2 },
  error: { color: colors.error },
  button: { backgroundColor: colors.primary, padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});