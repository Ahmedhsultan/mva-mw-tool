export interface Reservation {
  id: string;
  userName: string;
  services: string[];
  environment: string;
  startDate: string;
  endDate: string;
}

/** 2-char abbreviation and unique color for each microservice */
export const SERVICE_META: Record<string, { abbr: string; color: string }> = {
  'mvax-api':               { abbr: 'AP', color: '#e60000' },
  'mvax-native-billing':    { abbr: 'NB', color: '#2563eb' },
  'mvax-offers':            { abbr: 'OF', color: '#16a34a' },
  'mvax-upgrades':          { abbr: 'UP', color: '#9333ea' },
  'mvax-authentication':    { abbr: 'AU', color: '#ea580c' },
  'mvax-plan-services':     { abbr: 'PS', color: '#0891b2' },
  'mvax-adobe-integrator':  { abbr: 'AI', color: '#c026d3' },
  'mvax-account-dashboard': { abbr: 'AD', color: '#ca8a04' },
  'mvax-common':            { abbr: 'CM', color: '#64748b' },
  'mvax-population-engine': { abbr: 'PE', color: '#059669' },
};

export const ENVIRONMENTS = [
  'int1',
  'dev1',
  'qcx',
  'qc1',
  'qc2',
  'qc5',
  'prodsup',
  'pat2',
  'pat3',
  'prod1-blue',
] as const;

export type Environment = (typeof ENVIRONMENTS)[number];
