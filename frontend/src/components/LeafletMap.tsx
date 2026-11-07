// Phones (Android / iOS): Leaflet inside a WebView.
// Needs:  npx expo install react-native-webview
// (On web, Metro uses LeafletMap.web.tsx instead of this file.)
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildLeafletHtml, MapMarker } from './leafletHtml';

type Props = { markers: MapMarker[]; height?: number };

export default function LeafletMap({ markers, height = 280 }: Props) {
  const html = buildLeafletHtml(markers);
  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e5e7eb' }}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://localhost' }}
        javaScriptEnabled
        nestedScrollEnabled
        style={{ flex: 1 }}
      />
    </View>
  );
}
