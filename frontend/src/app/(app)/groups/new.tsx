import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import api from '../../../services/api';
import { errMsg, ui } from '../../../components/ui';

export default function NewGroupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const clean = name.trim();
    if (!clean) return setError('Please enter a group name');
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/groups', { name: clean });
      router.replace(`/groups/${data._id}`); // NOT VERIFIED: assumes the response is the group document
    } catch (e) {
      setError(errMsg(e, 'Could not create the group'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={ui.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={ui.link}>← Back</Text>
      </Pressable>
      <Text style={ui.title}>Create a group</Text>
      {error && <Text style={ui.error}>{error}</Text>}
      <TextInput style={ui.input} value={name} onChangeText={setName} placeholder="Group name (e.g. Northern trip)" maxLength={60} />
      <Pressable style={[ui.btn, busy && { opacity: 0.5 }]} onPress={create} disabled={busy}>
        <Text style={ui.btnText}>{busy ? 'Creating...' : 'Create group'}</Text>
      </Pressable>
    </View>
  );
}