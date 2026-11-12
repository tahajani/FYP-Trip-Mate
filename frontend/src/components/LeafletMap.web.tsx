// Web: the same Leaflet page inside an <iframe>.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { buildLeafletHtml, MapMarker, RouteLine } from './leafletHtml';

type Props = { markers: MapMarker[]; routes?: RouteLine[]; height?: number };

export default function LeafletMap({ markers, routes, height = 280 }: Props) {
  // memoised so the iframe is not reloaded on every unrelated re-render of the screen
  const html = useMemo(() => buildLeafletHtml(markers, routes), [markers, routes]);
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
