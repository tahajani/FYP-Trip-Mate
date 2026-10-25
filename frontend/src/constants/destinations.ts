import { ImageSourcePropType } from 'react-native';

export type Destination = {
  slug: string;
  name: string;
  region: string;
  emoji: string;
  color: string; // fallback background jab photo na ho
  image?: ImageSourcePropType;
  blurb: string;
  highlights: string[];
  tags: string[]; // INTERESTS keys, personal match nikalne ke liye
};

// Place names general knowledge se hain. Seeding ke baad verify karna ke OSM me maujood hain.
export const DESTINATIONS: Destination[] = [
  {
    slug: 'islamabad',
    name: 'Islamabad',
    region: 'Islamabad Capital Territory',
    emoji: '🏔️',
    color: '#0f766e',
    // image: require('../assets/destinations/islamabad.jpg'),
    blurb: 'A green capital at the foot of the Margalla Hills, with viewpoints, trails and calm city life.',
    highlights: ['Faisal Mosque', 'Daman-e-Koh', 'Pakistan Monument'],
    tags: ['religious', 'viewpoints', 'nature_parks', 'outdoor_adventure', 'museums_art'],
  },
  {
    slug: 'lahore',
    name: 'Lahore',
    region: 'Punjab',
    emoji: '🕌',
    color: '#b45309',
    // image: require('../assets/destinations/lahore.jpg'),
    blurb: 'The cultural heart of Pakistan: Mughal monuments, old city lanes and legendary food streets.',
    highlights: ['Badshahi Mosque', 'Lahore Fort', 'Food Street'],
    tags: ['history_heritage', 'religious', 'food_cafes', 'shopping_markets', 'nature_parks'],
  },
  {
    slug: 'karachi',
    name: 'Karachi',
    region: 'Sindh',
    emoji: '🏖️',
    color: '#1d4ed8',
    // image: require('../assets/destinations/karachi.jpg'),
    blurb: 'A coastal metropolis with beaches, colonial architecture and a lively food scene.',
    highlights: ['Clifton Beach', 'Mohatta Palace', 'Frere Hall'],
    tags: ['waterfront_beach', 'history_heritage', 'museums_art', 'food_cafes', 'family_entertainment'],
  },
  {
    slug: 'multan',
    name: 'Multan',
    region: 'Punjab',
    emoji: '🏰',
    color: '#7c3aed',
    // image: require('../assets/destinations/multan.jpg'),
    blurb: 'The city of saints, known for shrines with blue tilework, an old fort and busy bazaars.',
    highlights: ['Shah Rukn-e-Alam Shrine', 'Multan Fort', 'Hussain Agahi Bazaar'],
    tags: ['religious', 'history_heritage', 'shopping_markets'],
  },
];