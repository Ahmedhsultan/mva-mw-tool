export interface Reservation {
  id: string;
  userName: string;
  environment: string;
  startDate: string;
  endDate: string;
}

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
] as const;

export type Environment = (typeof ENVIRONMENTS)[number];
