export interface VoisResource {
  id: string;
  label: string;
  description?: string;
  url?: string;
  type: 'link' | 'file';
  category: string;
  isCustom?: boolean;
}