import { View, Text, Pressable, ImageBackground, StyleSheet } from 'react-native';
import { Destination } from '../constants/destinations';
import { INTERESTS } from '../constants/interests';
import { colors } from './auth-styles';

type Props = { destination: Destination; matchCount: number; onPress: () => void };

export default function DestinationCard({ destination: d, matchCount, onPress }: Props) {
  const hero = (
    <View style={s.heroInner}>
      <View style={s.topRow}>
        {matchCount > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>★ Matches {matchCount} of your interests</Text>
          </View>
        ) : <View />}
      </View>
      <View>
        <Text style={s.region}>{d.region.toUpperCase()}</Text>
        <Text style={s.name}>{d.name}</Text>
      </View>
    </View>
  );

  return (
    <Pressable style={s.card} onPress={onPress}>
      {d.image ? (
        <ImageBackground source={d.image} style={s.hero} imageStyle={s.heroImage}>
          <View style={s.overlay}>{hero}</View>
        </ImageBackground>
      ) : (
        <View style={[s.hero, { backgroundColor: d.color }]}>
          <Text style={s.bigEmoji}>{d.emoji}</Text>
          <View style={s.overlay}>{hero}</View>
        </View>
      )}

      <View style={s.body}>
        <Text style={s.blurb} numberOfLines={3}>{d.blurb}</Text>
        <View style={s.tags}>
          {d.tags.slice(0, 3).map((key) => {
            const i = INTERESTS.find((x) => x.key === key);
            return i ? (
              <View key={key} style={s.tag}>
                <Text style={s.tagText}>{i.icon} {i.label}</Text>
              </View>
            ) : null;
          })}
        </View>
        <View style={s.footer}>
          <Text style={s.places}>{d.highlights.length} top places</Text>
          <Text style={s.explore}>Explore ›</Text>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    width: 270, backgroundColor: '#fff', borderRadius: 22, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  hero: { height: 170, justifyContent: 'flex-end' },
  heroImage: { resizeMode: 'cover' },
  bigEmoji: { position: 'absolute', right: 16, top: 12, fontSize: 64, opacity: 0.35 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)' },
  heroInner: { flex: 1, padding: 14, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row' },
  badge: { backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.text },
  region: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', letterSpacing: 0.8 },
  name: { color: '#fff', fontSize: 24, fontWeight: '800' },
  body: { padding: 14, gap: 10 },
  blurb: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  tagText: { fontSize: 11, color: colors.text, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  places: { color: colors.muted, fontSize: 12 },
  explore: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});