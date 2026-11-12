// Phones: the system date picker.
// Needs:  npx expo install @react-native-community/datetimepicker
// (On web, Metro uses DateField.web.tsx instead of this file.)
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatDay } from '../utils/dates';

type Props = { label: string; value: string; min?: string; max?: string; onChange: (iso: string) => void };

// ISO string <-> local Date at noon (noon keeps the day safe from daylight-saving edges)
const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
const fromDate = (d: Date) =>
  `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function DateField({ label, value, min, max, onChange }: Props) {
  const [showIos, setShowIos] = useState(false);

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: 'date',
        minimumDate: min ? toDate(min) : undefined,
        maximumDate: max ? toDate(max) : undefined,
        onChange: (e, d) => {
          if (e.type === 'set' && d) onChange(fromDate(d));
        },
      });
    } else {
      setShowIos((v) => !v);
    }
  };

  return (
    <View style={{ flex: 1, minWidth: 150 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable style={s.field} onPress={open}>
        <Text style={s.value}>{formatDay(value)}</Text>
      </Pressable>
      {showIos && Platform.OS === 'ios' && (
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          display="spinner"
          minimumDate={min ? toDate(min) : undefined}
          maximumDate={max ? toDate(max) : undefined}
          onChange={(_, d) => {
            if (d) onChange(fromDate(d));
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  field: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff' },
  value: { fontSize: 16, color: '#0f172a' },
});
