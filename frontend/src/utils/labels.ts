// Human names for the 10 interest categories (the keys are the ones stored in MongoDB).
export const CATEGORY_LABEL: Record<string, string> = {
  history_heritage: 'History & Heritage',
  religious: 'Religious',
  museums_art: 'Museums & Art',
  nature_parks: 'Nature & Parks',
  viewpoints: 'Viewpoints',
  food_cafes: 'Food & Cafes',
  shopping_markets: 'Shopping & Markets',
  outdoor_adventure: 'Outdoor Adventure',
  waterfront_beach: 'Waterfront & Beach',
  family_entertainment: 'Family & Entertainment',
};

export const categoryLabel = (key: string) => CATEGORY_LABEL[key] ?? key.replace(/_/g, ' ');
