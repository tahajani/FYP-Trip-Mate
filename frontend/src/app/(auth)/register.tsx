import { useState } from 'react';
import {
  View, Text, Pressable, ActivityIndicator, KeyboardAvoidingView,
  ScrollView, Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import AuthField from '../../components/AuthField';
import { authStyles as s } from '../../components/auth-styles';

export default function Register() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!name.trim() || !email.trim() || !password) {
      return setError('Saari fields zaroori hain');
    }
    if (password.length < 6) {
      return setError('Password kam az kam 6 characters ka ho');
    }
    setError('');
    setLoading(true);
    try {
      await register(name.trim(), email.trim().toLowerCase(), password);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Sign up fail ho gaya');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View style={s.logo}><Text style={s.logoText}>🧭</Text></View>
          <Text style={s.brand}>Account banao</Text>
          <Text style={s.subtitle}>TripMate join karo aur apna safar plan karo</Text>
        </View>

        <View style={s.card}>
          <AuthField
            label="Name"
            placeholder="Apna naam"
            value={name}
            onChangeText={setName}
          />
          <AuthField
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <AuthField
            label="Password"
            placeholder="Kam az kam 6 characters"
            isPassword
            value={password}
            onChangeText={setPassword}
          />

          {!!error && (
            <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>
          )}

          <Pressable
            style={[s.button, loading && s.buttonDisabled]}
            onPress={onSubmit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Sign Up</Text>}
          </Pressable>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Pehle se account hai?</Text>
          <Link href="/login" style={s.footerLink}>Login</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}