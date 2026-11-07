import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function AppLayout() {
  const { user } = useAuth();
  const pathname = usePathname();

  // Login nahi hai to login screen par bhejo
  if (!user) return <Redirect href="/login" />;

  // Interests khali hain (naya Google user) to pehle onboarding
  const needsOnboarding = !user.interests || user.interests.length === 0;
  if (needsOnboarding && pathname !== '/onboarding') {
    return <Redirect href="/onboarding" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}