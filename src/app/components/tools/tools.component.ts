import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Icon file paths within the zip (remaps icon.png → icons/icon.png) */
const ICON_ZIP_PATH: Record<string, string> = { 'icon.png': 'icons/icon.png' };

/** Extensions treated as binary blobs during zip creation */
const BINARY_EXTENSIONS = ['.png', '.jpg', '.ico'];

@Component({
  selector: 'app-tools',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tools.component.html',
  styleUrl: './tools.component.css',
})
export class ToolsComponent {
  showExtensionHelp = false;

  // ─────────────────────────────────────────────────────────
  // Public Actions
  // ─────────────────────────────────────────────────────────

  downloadExtension(): void {
    this.createZip(
      'assets/cloudwatch-log-extractor/',
      ['manifest.json', 'curl-printer.js', 'content.js', 'popup.html', 'popup.js', 'icon.png'],
      'mvax_log_to_curl.zip',
    );
  }

  toggleHelp(): void {
    this.showExtensionHelp = !this.showExtensionHelp;
  }

  // ─────────────────────────────────────────────────────────
  // Zip Helpers
  // ─────────────────────────────────────────────────────────

  private async createZip(basePath: string, files: string[], zipName: string): Promise<void> {
    const JSZip = await this.loadJSZip();
    const zip = new JSZip();

    for (const file of files) {
      try {
        const response = await fetch(basePath + file);
        const isBinary = BINARY_EXTENSIONS.some((ext) => file.endsWith(ext));
        const zipPath = ICON_ZIP_PATH[file] ?? file;

        if (isBinary) {
          zip.file(zipPath, await response.blob());
        } else {
          zip.file(zipPath, await response.text());
        }
      } catch {
        // Skip files that fail to fetch — zip will still work with the rest
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    this.triggerDownload(blob, zipName);
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private loadJSZip(): Promise<any> {
    return new Promise((resolve, reject) => {
      if ((window as any).JSZip) {
        resolve((window as any).JSZip);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve((window as any).JSZip);
      script.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(script);
    });
  }
}
