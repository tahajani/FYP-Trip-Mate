import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { INTERESTS, PACES } from '../../constants/interests';
import { DESTINATIONS } from '../../constants/destinations';
import DestinationCard from '../../components/DestinationCard';
import { colors } from '../../components/auth-styles';

const notify = (title: string, msg: string) =>
  Platform.OS === 'web' ? window.alert(`${title}\n${msg}`) : Alert.alert(title, msg);

export default function Home() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (user && !user.interests?.length) return <Redirect href="/onboarding" />;
  if (!user) return null;

  const firstName = user.name.split(' ')[0];
  const paceLabel = PACES.find((p) => p.key === user.pace)?.label ?? user.pace;

  // Jin destinations ke tags user ke interests se zyada milte hain wo pehle
  const ranked = DESTINATIONS.map((d) => ({
    d,
    match: d.tags.filter((t) => user.interests.includes(t)).length,
  })).sort((a, b) => b.match - a.match);

  const onPlanTrip = () => notify('Coming soon', 'Itinerary planning will be available soon.');

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.brandRow}>
          <View style={s.logo}><Text style={{ fontSize: 18 }}>🧭</Text></View>
          <Text style={s.brand}>TripMate</Text>
        </View>
        <Pressable onPress={logout} style={s.signOut}>
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {/* Welcome / profile banner */}
      <View style={s.banner}>
        <Text style={s.hello}>Hi {firstName} 👋</Text>
        <Text style={s.helloSub}>Where to next? Here is what we know about your travel style.</Text>
        <View style={s.chipRow}>
          {user.interests.map((key) => {
            const i = INTERESTS.find((x) => x.key === key);
            return i ? (
              <View key={key} style={s.chip}>
                <Text style={s.chipText}>{i.icon} {i.label}</Text>
              </View>
            ) : null;
          })}
          <View style={[s.chip, s.paceChip]}>
            <Text style={[s.chipText, { color: '#fff' }]}>⏱ {paceLabel} pace</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/onboarding')}>
          <Text style={s.editLink}>Edit preferences</Text>
        </Pressable>
      </View>

      {/* Destinations */}
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>Popular Destinations</Text>
        <Text style={s.sectionSub}>Sorted by how well they match your interests</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.carousel}
        snapToInterval={286}
        decelerationRate="fast"
      >
        {ranked.map(({ d, match }) => (
          <DestinationCard
            key={d.slug}
            destination={d}
            matchCount={match}
            onPress={() => notify(d.name, 'Destination details coming soon.')}
          />
        ))}
      </ScrollView>

      {/* Your trips */}
      <View style={s.tripsHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>Your Trips</Text>
          <Text style={s.sectionSub}>Plan and manage your itineraries</Text>
        </View>
        <Pressable style={s.planBtn} onPress={onPlanTrip}>
          <Text style={s.planBtnText}>＋ Plan New Trip</Text>
        </Pressable>
      </View>

      <View style={s.empty}>
        <Text style={{ fontSize: 40 }}>🗺️</Text>
        <Text style={s.emptyTitle}>No trips yet</Text>
        <Text style={s.emptySub}>
          Your planned trips will show up here once itinerary planning is ready.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 48, width: '100%', maxWidth: 900, alignSelf: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  brand: { fontSize: 20, fontWeight: '800', color: colors.text },
  signOut: { paddingVertical: 6, paddingHorizontal: 10 },
  signOutText: { color: colors.muted, fontWeight: '600' },

  banner: {
    marginHorizontal: 20, marginTop: 8, padding: 18, borderRadius: 20,
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', gap: 8,
  },
  hello: { fontSize: 22, fontWeight: '800', color: colors.text },
  helloSub: { color: colors.muted, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  paceChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text },
  editLink: { color: colors.primary, fontWeight: '700', marginTop: 4 },

  sectionHead: { paddingHorizontal: 20, marginTop: 28, marginBottom: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  sectionSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  carousel: { paddingHorizontal: 20, gap: 16 },

  tripsHead: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 36, gap: 12,
  },
  planBtn: { backgroundColor: '#f43f5e', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999 },
  planBtnText: { color: '#fff', fontWeight: '700' },
  empty: {
    margin: 20, padding: 28, borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', gap: 6,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptySub: { color: colors.muted, textAlign: 'center', fontSize: 13 },
});