/**
 * Represents a resource link or file in the VOIS Resources page.
 * Used for both default (built-in) and user-added custom resources.
 */
export interface VoisResource {
  /** Display name shown in the resource card */
  label: string;
  /** Optional description shown below the label */
  description?: string;
  /** URL for links or download path for files */
  url?: string;
  /** Whether this is a web link or a downloadable file */
  type: 'link' | 'file';
  /** Grouping category (e.g. 'Cloud & AWS', 'Monitoring') */
  category: string;
}
