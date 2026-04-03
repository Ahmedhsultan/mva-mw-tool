// ── Reservation Model ────────────────────────────────────────

/** A time-boxed environment reservation for one or more microservices */
export interface Reservation {
  /** Unique identifier */
  id: string;
  /** Display name of the person who made the reservation */
  userName: string;
  /** List of reserved microservice names */
  services: string[];
  /** Target environment (e.g. 'int1', 'qc1') */
  environment: string;
  /** Start date in YYYY-MM-DD format */
  startDate: string;
  /** End date in YYYY-MM-DD format (inclusive) */
  endDate: string;
}

// ── Service Metadata ─────────────────────────────────────────

/** Visual metadata for each microservice (abbreviation + color) */
export interface ServiceMetaEntry {
  /** 2‑character abbreviation shown in badges */
  abbr: string;
  /** Hex color used for chips / borders */
  color: string;
}

/** Default 2-char abbreviation and unique color for each microservice */
export const SERVICE_META: Record<string, ServiceMetaEntry> = {
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

/** Look up abbreviation with fallback */
export function getServiceAbbr(svc: string): string {
  return SERVICE_META[svc]?.abbr ?? svc.substring(0, 2).toUpperCase();
}

/** Look up color with fallback */
export function getServiceColor(svc: string): string {
  return SERVICE_META[svc]?.color ?? '#64748b';
}

// ── Environments ─────────────────────────────────────────────

/** Default environment list (used as initial seed; runtime list comes from SettingsService) */
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
