// Web: the same Leaflet page inside an <iframe>.
import React from 'react';
import { View } from 'react-native';
import { buildLeafletHtml, MapMarker } from './leafletHtml';

type Props = { markers: MapMarker[]; height?: number };

export default function LeafletMap({ markers, height = 280 }: Props) {
  const html = buildLeafletHtml(markers);
  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e5e7eb' }}>
      {React.createElement('iframe', {
        srcDoc: html,
        title: 'Trip map',
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
}
