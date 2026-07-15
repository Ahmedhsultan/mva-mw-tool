import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, TimeoutError } from 'rxjs';
import { VoisResource } from './vois-resource.model';
import { VoisResourceStoreService } from './vois-resource-store.service';

const FILE_ICON_MAP: Record<string, string> = {
  csv: 'spreadsheet',
  doc: 'doc',
  docx: 'doc',
  pdf: 'pdf',
  ppt: 'ppt',
  pptx: 'ppt',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet'
};

@Component({
  selector: 'app-vois-resources',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vois-resources.component.html',
  styleUrl: './vois-resources.component.scss'
})
export class VoisResourcesComponent implements OnInit, OnDestroy {
  private readonly resourceStore = inject(VoisResourceStoreService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subscription?: Subscription;

  searchQuery = '';
  showAddModal = false;
  newLabel = '';
  newUrl = '';
  newDescription = '';
  newType: 'link' | 'file' = 'link';
  newCategory = '';
  newCategoryCustom = '';
  saving = false;
  loading = false;
  loadingMessage = '';
  errorMessage = '';

  allResources: VoisResource[] = [];

  ngOnInit(): void {
    this.subscription = this.resourceStore.resources$.subscribe((resources) => {
      console.log('[Resources] subscription fired, count:', resources.length);
      this.allResources = resources;
      this.cdr.detectChanges();
    });

    void this.loadResources();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  get resources(): VoisResource[] {
    return this.allResources;
  }

  get categories(): string[] {
    return [...new Set(this.filteredResources.map((resource) => resource.category))].sort();
  }

  get filteredResources(): VoisResource[] {
    const query = this.searchQuery.trim().toLowerCase();

    if (!query) {
      return this.resources;
    }

    return this.resources.filter((resource) =>
      resource.label.toLowerCase().includes(query)
      || resource.category.toLowerCase().includes(query)
      || (resource.description ?? '').toLowerCase().includes(query)
    );
  }

  get allCategoryNames(): string[] {
    return [...new Set(this.allResources.map((resource) => resource.category))].sort();
  }

  get resolvedCategory(): string {
    return this.newCategory === '__new__' ? this.newCategoryCustom.trim() : this.newCategory;
  }

  get canSaveResource(): boolean {
    return this.newLabel.trim().length > 0 && this.resolvedCategory.length > 0;
  }

  resourcesByCategory(category: string): VoisResource[] {
    return this.filteredResources.filter((resource) => resource.category === category);
  }

  isCustom(resource: VoisResource): boolean {
    return Boolean(resource.isCustom);
  }

  trackById(_: number, resource: VoisResource): string {
    return resource.id;
  }

  getFileIcon(label: string): string {
    const extension = label.split('.').pop()?.toLowerCase() ?? '';
    return FILE_ICON_MAP[extension] ?? 'generic';
  }

  openAddModal(): void {
    this.errorMessage = '';
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

  async saveNewResource(): Promise<void> {
    if (!this.canSaveResource) {
      return;
    }

    const saved = await this.runBackendAction('Saving resource...', () => this.resourceStore.addResource({
        label: this.newLabel.trim(),
        url: this.newUrl.trim() || undefined,
        description: this.newDescription.trim() || undefined,
        type: this.newType,
        category: this.resolvedCategory
      }));

    if (saved) {
      this.closeAddModal();
    }
  }

  async deleteCustomResource(resource: VoisResource): Promise<void> {
    if (!resource.isCustom || !confirm(`Are you sure you want to delete the resource "${resource.label}"?`)) {
      return;
    }

    await this.runBackendAction('Removing resource...', () => this.resourceStore.deleteResource(resource.id));
  }

  retryLoadResources(): void {
    void this.loadResources();
  }

  private async loadResources(): Promise<void> {
    this.loading = true;
    this.loadingMessage = 'Loading resources from the backend...';
    this.errorMessage = '';
    this.cdr.detectChanges();

    try {
      await this.resourceStore.loadResources();
      console.log('[Resources] loadResources completed, allResources:', this.allResources.length);
    } catch (error) {
      console.error('[Resources] loadResources error:', error);
      this.errorMessage = this.describeError(error, 'Could not load resources from the backend.');
    } finally {
      this.loading = false;
      this.loadingMessage = '';
      this.cdr.detectChanges();
    }
  }

  private async runBackendAction(message: string, action: () => Promise<void>): Promise<boolean> {
    this.saving = true;
    this.loadingMessage = message;
    this.errorMessage = '';
    this.cdr.detectChanges();

    try {
      await action();
      return true;
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The backend request did not complete.');
      return false;
    } finally {
      this.saving = false;
      this.loadingMessage = '';
      this.cdr.detectChanges();
    }
  }

  private describeError(error: unknown, fallback: string): string {
    if (error instanceof TimeoutError) {
      return 'The resources request timed out while waiting for the backend or remote repository.';
    }

    if (error instanceof HttpErrorResponse) {
      if (typeof error.error === 'string' && error.error.trim()) {
        return error.error;
      }

      if (error.error && typeof error.error.error === 'string' && error.error.error.trim()) {
        return error.error.error;
      }

      if (error.error && typeof error.error.message === 'string' && error.error.message.trim()) {
        return error.error.message;
      }

      return error.message || fallback;
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return fallback;
  }
}