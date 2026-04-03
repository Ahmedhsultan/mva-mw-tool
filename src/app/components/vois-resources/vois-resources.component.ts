import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VoisResource } from '../../models/vois-resource.model';
import { DEFAULT_RESOURCES } from '../../data/default-resources.data';

// ── File Extension → Icon Type Map ──────────────────────────
const FILE_ICON_MAP: Record<string, string> = {
  xlsx: 'spreadsheet', xls: 'spreadsheet', csv: 'spreadsheet',
  docx: 'doc', doc: 'doc',
  pdf: 'pdf',
  pptx: 'ppt', ppt: 'ppt',
};

@Component({
  selector: 'app-vois-resources',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vois-resources.component.html',
  styleUrl: './vois-resources.component.css',
})
export class VoisResourcesComponent {
  // ── Search ────────────────────────────────────────────────
  searchQuery = '';

  // ── Add Resource Modal State ──────────────────────────────
  showAddModal = false;
  newLabel = '';
  newUrl = '';
  newDescription = '';
  newType: 'link' | 'file' = 'link';
  newCategory = '';
  newCategoryCustom = '';

  // ── Custom Resources (localStorage) ───────────────────────
  private readonly STORAGE_KEY = 'vois-custom-resources';
  customResources: VoisResource[] = this.loadCustomResources();

  // ─────────────────────────────────────────────────────────
  // Computed Properties
  // ─────────────────────────────────────────────────────────

  /** All resources: built-in defaults + user-added custom ones */
  get resources(): VoisResource[] {
    return [...DEFAULT_RESOURCES, ...this.customResources];
  }

  /** Sorted category names derived from filtered resources */
  get categories(): string[] {
    return [...new Set(this.filteredResources.map((r) => r.category))].sort();
  }

  /** Resources matching the current search query */
  get filteredResources(): VoisResource[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.resources;
    return this.resources.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q),
    );
  }

  /** Category names from all resources (for modal dropdown) */
  get allCategoryNames(): string[] {
    const cats = new Set<string>(DEFAULT_RESOURCES.map((r) => r.category));
    this.customResources.forEach((r) => cats.add(r.category));
    return [...cats].sort();
  }

  /** Resolved category for the add-resource form */
  get resolvedCategory(): string {
    return this.newCategory === '__new__'
      ? this.newCategoryCustom.trim()
      : this.newCategory;
  }

  /** Whether the current add-resource form can be saved */
  get canSaveResource(): boolean {
    return this.newLabel.trim().length > 0 && this.resolvedCategory.length > 0;
  }

  // ─────────────────────────────────────────────────────────
  // Resource Queries
  // ─────────────────────────────────────────────────────────

  resourcesByCategory(category: string): VoisResource[] {
    return this.filteredResources.filter((r) => r.category === category);
  }

  isCustom(r: VoisResource): boolean {
    return this.customResources.some(
      (cr) => cr.label === r.label && cr.category === r.category,
    );
  }

  trackByLabel(_: number, r: VoisResource): string {
    return r.label;
  }

  getFileIcon(label: string): string {
    const ext = label.split('.').pop()?.toLowerCase() ?? '';
    return FILE_ICON_MAP[ext] ?? 'generic';
  }

  // ─────────────────────────────────────────────────────────
  // Add Resource Modal
  // ─────────────────────────────────────────────────────────

  openAddModal(): void {
    this.newLabel = '';
    this.newUrl = '';
    this.newDescription = '';
    this.newType = 'link';
    this.newCategory = '';
    this.newCategoryCustom = '';
    this.showAddModal = true;
  }

  closeAddModal(): void {
    this.showAddModal = false;
  }

  saveNewResource(): void {
    if (!this.canSaveResource) return;
    this.customResources.push({
      label: this.newLabel.trim(),
      url: this.newUrl.trim() || undefined,
      description: this.newDescription.trim() || undefined,
      type: this.newType,
      category: this.resolvedCategory,
    });
    this.saveCustomResources();
    this.closeAddModal();
  }

  deleteCustomResource(r: VoisResource): void {
    const idx = this.customResources.findIndex(
      (cr) => cr.label === r.label && cr.category === r.category,
    );
    if (idx !== -1) {
      this.customResources.splice(idx, 1);
      this.saveCustomResources();
    }
  }

  // ─────────────────────────────────────────────────────────
  // LocalStorage Persistence
  // ─────────────────────────────────────────────────────────

  private loadCustomResources(): VoisResource[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveCustomResources(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.customResources));
  }
}
