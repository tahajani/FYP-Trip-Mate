export type TripPlace = {
  poiId?: string;
  name: string;
  kind: string;
  location: { lat: number; lon: number };
  order?: number;
  visitMinutes: number;
  travelMinutesFromPrevious?: number;
  score?: number;
  source?: string;
};

export type TripDay = {
  day: number;
  places: TripPlace[];
  capacityMinutes: number;
  visitMinutes: number;
  travelMinutes: number;
};

export type Trip = {
  _id: string;
  days: TripDay[];
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
