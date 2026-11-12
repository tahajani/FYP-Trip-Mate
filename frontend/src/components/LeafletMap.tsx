// Native (Android / iOS): the same Leaflet page inside a WebView.
// NOTE: I have not seen your current LeafletMap.tsx, so this is written from the handoff description.
// If your version had extra props or styling, merge only the `routes` prop and the useMemo.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildLeafletHtml, MapMarker, RouteLine } from './leafletHtml';

type Props = { markers: MapMarker[]; routes?: RouteLine[]; height?: number };

export default function LeafletMap({ markers, routes, height = 280 }: Props) {
  const html = useMemo(() => buildLeafletHtml(markers, routes), [markers, routes]);
  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e5e7eb' }}>
      <WebView originWhitelist={['*']} source={{ html }} style={{ flex: 1 }} javaScriptEnabled />
    </View>
  );
}
