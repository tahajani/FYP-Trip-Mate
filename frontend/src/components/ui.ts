import { Alert, Platform, StyleSheet } from 'react-native';

export const errMsg = (e: any, fallback = 'Something went wrong') =>
  e?.response?.data?.message ?? e?.response?.data?.error ?? e?.message ?? fallback;

export function confirmAction(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) onYes();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: onYes },
    ]);
  }
}

export const ui = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 48, backgroundColor: '#f8fafc' },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  h2: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 18, marginBottom: 8 },
  link: { color: '#2563eb', fontWeight: '600', marginBottom: 6 },
  muted: { color: '#64748b' },
  error: { color: '#b91c1c', marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  btn: { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  btnGhost: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  btnGhostText: { color: '#2563eb', fontWeight: '800' },
  btnDanger: { borderWidth: 1, borderColor: '#b91c1c', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  btnDangerText: { color: '#b91c1c', fontWeight: '800' },
  badge: { fontSize: 11, fontWeight: '700', color: '#475569', backgroundColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
});