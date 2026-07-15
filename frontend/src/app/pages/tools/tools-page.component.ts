import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

const ICON_ZIP_PATH: Record<string, string> = {
  'icon.png': 'icons/icon.png'
};

const BINARY_EXTENSIONS = ['.png', '.jpg', '.ico'];

@Component({
  selector: 'app-tools-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tools-page.component.html',
  styleUrl: './tools-page.component.scss'
})
export class ToolsPageComponent {
  showExtensionHelp = false;

  msisdn = '';
  loaLevel: 'LOA1' | 'LOA3' = 'LOA1';
  server = 'qc1';

  readonly servers = [
    { value: 'int1', label: 'INT1' },
    { value: 'dev1', label: 'DEV1' },
    { value: 'qc1', label: 'QC1' },
    { value: 'qc2', label: 'QC2' },
    { value: 'qcx', label: 'QCX' },
    { value: 'pat1-common', label: 'PAT1' },
    { value: 'pat2', label: 'PAT2' },
    { value: 'prodsup', label: 'PRODSUP' }
  ];

  downloadExtension(): void {
    void this.createZip(
      'assets/cloudwatch-log-extractor/',
      ['manifest.json', 'curl-printer.js', 'content.js', 'popup.html', 'popup.js', 'icon.png'],
      'mvax_log_to_curl.zip'
    );
  }

  toggleHelp(): void {
    this.showExtensionHelp = !this.showExtensionHelp;
  }

  private async createZip(basePath: string, files: string[], zipName: string): Promise<void> {
    const JSZip = await this.loadJSZip();
    const zip = new JSZip();

    for (const file of files) {
      try {
        const response = await fetch(basePath + file);

        if (!response.ok) {
          continue;
        }

        const isBinary = BINARY_EXTENSIONS.some((extension) => file.endsWith(extension));
        const zipPath = ICON_ZIP_PATH[file] ?? file;

        if (isBinary) {
          zip.file(zipPath, await response.blob());
        } else {
          zip.file(zipPath, await response.text());
        }
      } catch {
        // Ignore missing files so the rest of the package can still download.
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    this.triggerDownload(blob, zipName);
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private loadJSZip(): Promise<any> {
    return new Promise((resolve, reject) => {
      const existing = (window as Window & { JSZip?: unknown }).JSZip;

      if (existing) {
        resolve(existing);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve((window as Window & { JSZip?: unknown }).JSZip);
      script.onerror = () => reject(new Error('Failed to load JSZip.'));
      document.head.appendChild(script);
    });
  }
}