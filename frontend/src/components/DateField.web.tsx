// Web: the browser's own date picker (<input type="date">).
import React from 'react';
import { Text, View } from 'react-native';

type Props = { label: string; value: string; min?: string; max?: string; onChange: (iso: string) => void };

export default function DateField({ label, value, min, max, onChange }: Props) {
  return (
    <View style={{ flex: 1, minWidth: 150 }}>
      <Text style={{ fontWeight: '700', color: '#0f172a', marginBottom: 6 }}>{label}</Text>
      {React.createElement('input', {
        type: 'date',
        value,
        min,
        max,
        onChange: (e: any) => {
          if (e.target.value) onChange(e.target.value); // empty when the user clears the field: ignore
        },
        style: {
          border: '1px solid #cbd5e1',
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: 16,
          backgroundColor: '#fff',
          width: '100%',
          boxSizing: 'border-box',
        },
      })}
    </View>
  );
}
