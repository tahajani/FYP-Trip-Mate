import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import AssistantChat from './AssistantChat';

// Default: floating circle (used on the home screen).
// compact: a small "Assistant" pill for a header (used on the group chat screen).
export default function AssistantDock({ groupId, compact }: { groupId?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  const panelW = Math.min(400, Math.round(width * 0.92));
  const x = useRef(new Animated.Value(panelW)).current;
  const native = Platform.OS !== 'web';

  useEffect(() => {
    if (!open) return;
    x.setValue(panelW);
    Animated.timing(x, { toValue: 0, duration: 220, useNativeDriver: native }).start();
  }, [open, panelW, x, native]);

  const close = () => {
    Animated.timing(x, { toValue: panelW, duration: 180, useNativeDriver: native }).start(() => setOpen(false));
  };

  return (
    <>
      <Pressable style={compact ? s.pill : s.fab} onPress={() => setOpen(true)} accessibilityLabel="Open assistant">
        <Text style={compact ? s.pillText : s.fabIcon}>{compact ? '💬 Assistant' : '💬'}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <View style={s.overlay}>
          <Pressable style={s.backdrop} onPress={close} />
          <Animated.View style={[s.panel, { width: panelW, transform: [{ translateX: x }] }]}>
            <View style={s.header}>
              <Text style={s.title}>TripMate assistant</Text>
              <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close assistant">
                <Text style={s.x}>✕</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 14, paddingBottom: 14 }}>
              <AssistantChat groupId={groupId} />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  fabIcon: { fontSize: 26 },
  pill: { backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: { backgroundColor: '#f8fafc', height: '100%' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  x: { fontSize: 20, color: '#475569', fontWeight: '700' },
});