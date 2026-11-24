import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AssistantChat from '../../components/AssistantChat';
import { ui } from '../../components/ui';

// Open it as /assistant, or /assistant?groupId=<id> from a group page (then "why did we get these places?" works).
export default function AssistantScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();
  return (
    <View style={ui.container}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))}>
        <Text style={ui.link}>← Back</Text>
      </Pressable>
      <Text style={ui.title}>TripMate assistant</Text>
      <AssistantChat groupId={groupId} />
    </View>
  );
}