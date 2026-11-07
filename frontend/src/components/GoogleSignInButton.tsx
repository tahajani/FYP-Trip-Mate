import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  onIdToken: (idToken: string) => Promise<void>;
  onError?: (message: string) => void;
};

export default function GoogleSignInButton({ onIdToken, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  // DEBUG: ye redirectUri Google Console ke "Authorized redirect URIs" mein bilkul same hona chahiye
  console.log('redirectUri:', request?.redirectUri);
  console.log('google response:', response);

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken = response.params?.id_token;
      if (!idToken) {
        onError?.('Google did not return an id_token');
        return;
      }
      setBusy(true);
      onIdToken(idToken)
        .catch((e) => onError?.(e?.response?.data?.message ?? e?.message ?? 'Google login failed'))
        .finally(() => setBusy(false));
    } else if (response.type === 'error') {
      onError?.(response.error?.message ?? 'Google sign-in failed');
    }
  }, [response]);

  return (
    <Pressable
      style={[styles.button, (!request || busy) && styles.disabled]}
      disabled={!request || busy}
      onPress={() => promptAsync()}
    >
      {busy ? <ActivityIndicator /> : <Text style={styles.text}>Continue with Google</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#fff',
  },
  disabled: { opacity: 0.6 },
  text: { fontSize: 16, fontWeight: '600', color: '#222' },
});