// Builds one self-contained HTML page with a Leaflet map. The same page is shown in an <iframe> on web
// and in a WebView on phones, so the map code lives in a single place.
export type MapMarker = { lat: number; lon: number; label: string; num: number; color: string };

// OpenStreetMap's public tile server is fine for development. For production check its tile usage policy
// or switch this URL to another tile provider.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function buildLeafletHtml(markers: MapMarker[]): string {
  // "<" is escaped so a place name can never close the <script> tag
  const data = JSON.stringify(markers).replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
html,body,#map{height:100%;margin:0;padding:0}
.pin{color:#fff;border:2px solid #fff;border-radius:50%;width:28px;height:28px;line-height:24px;text-align:center;font:700 12px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.45)}
</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var markers = ${data};
var map = L.map('map');
L.tileLayer('${TILE_URL}', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
var pts = [];
var lines = {};
markers.forEach(function (m) {
  var color = String(m.color).replace(/[^#0-9a-fA-F]/g, '');
  var icon = L.divIcon({
    className: '',
    html: '<div class="pin" style="background:' + color + '">' + Number(m.num) + '</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
  var el = document.createElement('div');
  el.textContent = m.num + '. ' + m.label;
  L.marker([m.lat, m.lon], { icon: icon }).bindPopup(el).addTo(map);
  pts.push([m.lat, m.lon]);
  (lines[color] = lines[color] || []).push([m.lat, m.lon]);
});
Object.keys(lines).forEach(function (c) {
  if (lines[c].length > 1) L.polyline(lines[c], { color: c, weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(map);
});
if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] });
else if (pts.length === 1) map.setView(pts[0], 14);
else map.setView([30.3753, 69.3451], 5);
</script></body></html>`;
}
