import { StyleSheet } from 'react-native';

export const colors = {
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  error: '#dc2626',
  errorBg: '#fef2f2',
};

export const authStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 28 },
  logo: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  logoText: { fontSize: 30 },
  brand: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 4, textAlign: 'center' },
  card: {
    width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: colors.card,
    borderRadius: 20, padding: 22, gap: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
    borderColor: colors.border, borderRadius: 12, backgroundColor: colors.bg,
  },
  inputFocused: { borderColor: colors.primary, backgroundColor: '#fff' },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.text },
  toggle: { paddingHorizontal: 14, paddingVertical: 10 },
  toggleText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  errorBox: { backgroundColor: colors.errorBg, borderRadius: 10, padding: 12 },
  errorText: { color: colors.error, fontSize: 14 },
  button: {
    backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 12,
    alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20, gap: 6 },
  footerText: { color: colors.muted, fontSize: 15 },
  footerLink: { color: colors.primary, fontSize: 15, fontWeight: '700' },
});