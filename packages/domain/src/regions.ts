/**
 * Operating regions (docs/plans/2026-10-16-workspaces-and-regions.md, D-102). An account belongs to the region of the
 * state in its registered address; reviewers are appointed per region. Bihar, Jharkhand, Odisha and West Bengal are
 * in Central (owner's decision).
 */

export const REGIONS = ['north', 'west', 'central', 'south', 'north_east'] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_LABEL: Record<Region, string> = {
  north: 'North',
  west: 'West',
  central: 'Central',
  south: 'South',
  north_east: 'North East',
};

export interface IndianState {
  /** Short code (vehicle-registration style), stored on the application. */
  code: string;
  name: string;
  /** GST state code — the first two digits of a GSTIN. */
  gst: string;
  region: Region;
}

/** All 28 states and 8 union territories, by region. */
export const INDIAN_STATES: readonly IndianState[] = [
  { code: 'JK', name: 'Jammu and Kashmir', gst: '01', region: 'north' },
  { code: 'HP', name: 'Himachal Pradesh', gst: '02', region: 'north' },
  { code: 'PB', name: 'Punjab', gst: '03', region: 'north' },
  { code: 'CH', name: 'Chandigarh', gst: '04', region: 'north' },
  { code: 'UK', name: 'Uttarakhand', gst: '05', region: 'north' },
  { code: 'HR', name: 'Haryana', gst: '06', region: 'north' },
  { code: 'DL', name: 'Delhi', gst: '07', region: 'north' },
  { code: 'RJ', name: 'Rajasthan', gst: '08', region: 'north' },
  { code: 'UP', name: 'Uttar Pradesh', gst: '09', region: 'north' },
  { code: 'LA', name: 'Ladakh', gst: '38', region: 'north' },
  { code: 'GJ', name: 'Gujarat', gst: '24', region: 'west' },
  { code: 'DH', name: 'Dadra and Nagar Haveli and Daman and Diu', gst: '26', region: 'west' },
  { code: 'MH', name: 'Maharashtra', gst: '27', region: 'west' },
  { code: 'GA', name: 'Goa', gst: '30', region: 'west' },
  { code: 'BR', name: 'Bihar', gst: '10', region: 'central' },
  { code: 'WB', name: 'West Bengal', gst: '19', region: 'central' },
  { code: 'JH', name: 'Jharkhand', gst: '20', region: 'central' },
  { code: 'OD', name: 'Odisha', gst: '21', region: 'central' },
  { code: 'CG', name: 'Chhattisgarh', gst: '22', region: 'central' },
  { code: 'MP', name: 'Madhya Pradesh', gst: '23', region: 'central' },
  { code: 'KA', name: 'Karnataka', gst: '29', region: 'south' },
  { code: 'LD', name: 'Lakshadweep', gst: '31', region: 'south' },
  { code: 'KL', name: 'Kerala', gst: '32', region: 'south' },
  { code: 'TN', name: 'Tamil Nadu', gst: '33', region: 'south' },
  { code: 'PY', name: 'Puducherry', gst: '34', region: 'south' },
  { code: 'AN', name: 'Andaman and Nicobar Islands', gst: '35', region: 'south' },
  { code: 'TS', name: 'Telangana', gst: '36', region: 'south' },
  { code: 'AP', name: 'Andhra Pradesh', gst: '37', region: 'south' },
  { code: 'SK', name: 'Sikkim', gst: '11', region: 'north_east' },
  { code: 'AR', name: 'Arunachal Pradesh', gst: '12', region: 'north_east' },
  { code: 'NL', name: 'Nagaland', gst: '13', region: 'north_east' },
  { code: 'MN', name: 'Manipur', gst: '14', region: 'north_east' },
  { code: 'MZ', name: 'Mizoram', gst: '15', region: 'north_east' },
  { code: 'TR', name: 'Tripura', gst: '16', region: 'north_east' },
  { code: 'ML', name: 'Meghalaya', gst: '17', region: 'north_east' },
  { code: 'AS', name: 'Assam', gst: '18', region: 'north_east' },
];

const BY_CODE = new Map(INDIAN_STATES.map((s) => [s.code, s]));
const BY_GST = new Map(INDIAN_STATES.map((s) => [s.gst, s]));

export const stateByCode = (code: string | null | undefined): IndianState | null => (code ? (BY_CODE.get(code) ?? null) : null);

/** The region of a state code; null when the state isn't set (applications from before regions existed). */
export const regionOf = (code: string | null | undefined): Region | null => stateByCode(code)?.region ?? null;

/** The state a GSTIN was issued in (its first two digits), for pre-filling the form. */
export const stateFromGstin = (gstin: string | null | undefined): IndianState | null => (gstin && gstin.length >= 2 ? (BY_GST.get(gstin.slice(0, 2)) ?? null) : null);

export const isRegion = (v: unknown): v is Region => typeof v === 'string' && (REGIONS as readonly string[]).includes(v);
