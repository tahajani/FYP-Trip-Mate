import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function AppLayout() {
  const { user } = useAuth();

  // Login nahi hai to login screen par bhejo
  if (!user) return <Redirect href="/login" />;

  return <Stack />;
}