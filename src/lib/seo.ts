import { absoluteSiteUrl, siteUrl } from '@/lib/site';

export const SITE_NAME = 'AI Board Games';
export const DEFAULT_SEO_IMAGE = '/screenshots/secret-hitler.png';
export const DEFAULT_SEO_IMAGE_ALT =
  'AI Board Games browser tabletop game screenshot';
export const HOME_DESCRIPTION =
  'Play local-first board games against configurable AI opponents with bring-your-own-key provider settings.';

export interface PageSeo {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageAlt?: string;
  keywords?: string[];
}

export interface GameSeo extends PageSeo {
  gameName: string;
  alternateName?: string[];
  minPlayers: number;
  maxPlayers: number;
  genre: string[];
}

export const imageDimensions: Record<
  string,
  { width: number; height: number }
> = {
  '/screenshots/secret-hitler.png': { width: 1651, height: 880 },
  '/screenshots/splendor.png': { width: 2325, height: 957 },
};

export const homeSeo: PageSeo = {
  title: 'AI Board Games | Local-First AI Tabletop Games',
  description: HOME_DESCRIPTION,
  path: '/',
  image: DEFAULT_SEO_IMAGE,
  imageAlt: 'Secret Hitler game table screenshot from AI Board Games',
  keywords: [
    'AI board games',
    'browser board games',
    'local-first games',
    'BYOK AI games',
    'AI tabletop games',
  ],
};

export const aboutSeo: PageSeo = {
  title: `About | ${SITE_NAME}`,
  description:
    'Learn how AI Board Games runs local-first tabletop game engines with configurable AI model profiles and browser-stored provider keys.',
  path: '/about',
  image: DEFAULT_SEO_IMAGE,
  imageAlt: DEFAULT_SEO_IMAGE_ALT,
  keywords: [
    'AI Board Games',
    'local-first AI',
    'bring your own key AI',
    'browser game engines',
  ],
};

export const settingsSeo: PageSeo = {
  title: `Settings | ${SITE_NAME}`,
  description:
    'Configure local browser provider keys and AI model profiles for AI Board Games.',
  path: '/settings',
  image: DEFAULT_SEO_IMAGE,
  imageAlt: DEFAULT_SEO_IMAGE_ALT,
};

export const gameSeoById = {
  splendor: {
    title: `Splendor AI Game | ${SITE_NAME}`,
    gameName: 'Splendor AI Game',
    description:
      'Play Splendor against configurable AI opponents in a browser-based local-first board game table.',
    path: '/splendor',
    image: '/screenshots/splendor.png',
    imageAlt: 'Splendor AI game table screenshot',
    minPlayers: 2,
    maxPlayers: 4,
    genre: ['Board game', 'Strategy game', 'Engine-building game'],
    keywords: [
      'Splendor AI',
      'Splendor board game',
      'AI board game',
      'browser Splendor',
    ],
  },
  'secret-hitler': {
    title: `Secret Hitler AI Game | ${SITE_NAME}`,
    gameName: 'Secret Hitler AI Game',
    description:
      'Play a local-first Secret Hitler-inspired social deduction table with configurable AI players, hidden roles, policy decks, and table chat.',
    path: '/secret-hitler',
    image: '/screenshots/secret-hitler.png',
    imageAlt: 'Secret Hitler AI game table screenshot',
    minPlayers: 5,
    maxPlayers: 10,
    genre: ['Board game', 'Social deduction game', 'Party game'],
    keywords: [
      'Secret Hitler AI',
      'social deduction AI',
      'AI table chat',
      'browser Secret Hitler',
    ],
  },
  chess: {
    title: `Chess AI Game | ${SITE_NAME}`,
    gameName: 'Chess AI Game',
    description:
      'Play 3D chess against local bots or configurable AI model profiles in a browser-based local-first board game table.',
    path: '/chess',
    image: DEFAULT_SEO_IMAGE,
    imageAlt: DEFAULT_SEO_IMAGE_ALT,
    minPlayers: 2,
    maxPlayers: 2,
    genre: ['Board game', 'Strategy game', 'Abstract strategy game'],
    keywords: ['Chess AI', '3D chess', 'browser chess', 'AI chess game'],
  },
  'chinese-chess': {
    title: `Xiangqi AI Game | ${SITE_NAME}`,
    gameName: 'Xiangqi AI Game',
    alternateName: ['Chinese Chess AI Game', '象棋 AI Game'],
    description:
      'Play 3D Xiangqi, also known as Chinese Chess, against local bots or configurable AI opponents in a browser-based local-first board game table.',
    path: '/chinese-chess',
    image: DEFAULT_SEO_IMAGE,
    imageAlt: DEFAULT_SEO_IMAGE_ALT,
    minPlayers: 2,
    maxPlayers: 2,
    genre: ['Board game', 'Strategy game', 'Abstract strategy game'],
    keywords: ['Xiangqi AI', 'Chinese Chess AI', '象棋 AI', 'browser Xiangqi'],
  },
  'jungle-chess': {
    title: `Jungle Chess AI Game | ${SITE_NAME}`,
    gameName: 'Jungle Chess AI Game',
    alternateName: ['Dou Shou Qi AI Game', '斗兽棋 AI Game'],
    description:
      'Play 3D Jungle Chess, also known as Dou Shou Qi, against local bots or configurable AI opponents in a browser-based local-first board game table.',
    path: '/jungle-chess',
    image: DEFAULT_SEO_IMAGE,
    imageAlt: DEFAULT_SEO_IMAGE_ALT,
    minPlayers: 2,
    maxPlayers: 2,
    genre: ['Board game', 'Strategy game', 'Abstract strategy game'],
    keywords: [
      'Jungle Chess AI',
      'Dou Shou Qi AI',
      '斗兽棋 AI',
      'browser Jungle Chess',
    ],
  },
  'exploding-kittens': {
    title: `Exploding Kittens AI Game | ${SITE_NAME}`,
    gameName: 'Exploding Kittens AI Game',
    description:
      'Play Exploding Kittens against local bots or configurable AI opponents in a browser-based local-first board game table.',
    path: '/exploding-kittens',
    image: DEFAULT_SEO_IMAGE,
    imageAlt: DEFAULT_SEO_IMAGE_ALT,
    minPlayers: 2,
    maxPlayers: 5,
    genre: ['Card game', 'Party game', 'Push-your-luck game'],
    keywords: [
      'Exploding Kittens AI',
      'AI card game',
      'browser Exploding Kittens',
    ],
  },
} satisfies Record<string, GameSeo>;

export const publicSeoRoutes = [
  homeSeo,
  gameSeoById.splendor,
  gameSeoById['secret-hitler'],
  gameSeoById.chess,
  gameSeoById['chinese-chess'],
  gameSeoById['jungle-chess'],
  gameSeoById['exploding-kittens'],
  aboutSeo,
];

export function imageSizeFor(path: string | undefined) {
  return imageDimensions[path ?? DEFAULT_SEO_IMAGE];
}

export function createGameJsonLd(game: GameSeo, base = siteUrl()) {
  const image = game.image ?? DEFAULT_SEO_IMAGE;

  return {
    '@type': 'VideoGame',
    '@id': `${absoluteSiteUrl(game.path, base)}#game`,
    name: game.gameName,
    alternateName: game.alternateName,
    url: absoluteSiteUrl(game.path, base),
    description: game.description,
    image: absoluteSiteUrl(image, base),
    genre: game.genre,
    gamePlatform: 'Web browser',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web',
    playMode: 'SinglePlayer',
    numberOfPlayers: {
      '@type': 'QuantitativeValue',
      minValue: game.minPlayers,
      maxValue: game.maxPlayers,
    },
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
}

export function createHomeJsonLd(base = siteUrl()) {
  const image = homeSeo.image ?? DEFAULT_SEO_IMAGE;

  return [
    {
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      name: SITE_NAME,
      url: base,
      description: homeSeo.description,
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${base}/#app`,
      name: SITE_NAME,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web',
      url: base,
      description: homeSeo.description,
      image: absoluteSiteUrl(image, base),
      isAccessibleForFree: true,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
  ];
}

export function createAboutJsonLd(base = siteUrl()) {
  return {
    '@type': 'AboutPage',
    '@id': `${absoluteSiteUrl(aboutSeo.path, base)}#about`,
    name: 'About AI Board Games',
    url: absoluteSiteUrl(aboutSeo.path, base),
    mainEntity: {
      '@type': 'SoftwareApplication',
      '@id': `${base}/#app`,
      name: SITE_NAME,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web',
    },
  };
}
