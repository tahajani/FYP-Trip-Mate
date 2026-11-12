export type TripPlace = {
  poiId?: string;
  name: string;
  kind: string;
  location: { lat: number; lon: number };
  order?: number;
  visitMinutes: number;
  travelMinutesFromPrevious?: number;
  score?: number;
  matched?: string[]; // which of the user's chosen interests this place fits
  source?: string;
};

export type TripDay = {
  day: number;
  date?: string; // 'YYYY-MM-DD'
  places: TripPlace[];
  capacityMinutes: number;
  visitMinutes: number;
  travelMinutes: number;
};

export type Trip = {
  _id: string;
  startDate?: string;
  endDate?: string;
  dayCount?: number;
  days: TripDay[];
  travelTimeSource?: 'osrm' | 'haversine';
  warnings?: string[];
};

export type SearchResult = {
  source: 'nominatim' | 'seeded';
  poiId?: string;
  name: string;
  displayName?: string;
  kind: string;
  location: { lat: number; lon: number };
  visitMinutes?: number;
};
