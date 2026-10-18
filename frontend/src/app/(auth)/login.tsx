import { useState } from 'react';
import {
  View, Text, Pressable, ActivityIndicator, KeyboardAvoidingView,
  ScrollView, Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import AuthField from '../../components/AuthField';
import { authStyles as s } from '../../components/auth-styles';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      return setError('Email aur password zaroori hain');
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Login fail ho gaya');
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
          <Text style={s.brand}>TripMate</Text>
          <Text style={s.subtitle}>Wapas aane par khushi hui! Login karo</Text>
        </View>

        <View style={s.card}>
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
            placeholder="Apna password likho"
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
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Login</Text>}
          </Pressable>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Account nahi hai?</Text>
          <Link href="/register" style={s.footerLink}>Sign up</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}