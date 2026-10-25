import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';


export default function Home() {
  const { user, logout } = useAuth();
  
  if (user && user.interests.length === 0) return <Redirect href="/onboarding" />;

  return (
    <View style={s.container}>
      <Text style={s.title}>Welcome, {user?.name}</Text>
      <Text>{user?.email}</Text>
      <Pressable style={s.button} onPress={logout}>
        <Text style={s.btnText}>Logout</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  button: { backgroundColor: '#dc2626', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600' },
});