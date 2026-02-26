import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tools',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tools.component.html',
  styleUrl: './tools.component.css',
})
export class ToolsComponent {
  tokenResult: string = '';
  tokenLoading = false;
  tokenCopied = false;
  showExtensionHelp = false;

  /** Opens Azure DevOps PAT page in a new tab */
  openAzureTokenPage(): void {
    window.open('https://dev.azure.com/vfuk-digital/_usersSettings/tokens', '_blank');
    this.tokenResult = '';
    this.tokenLoading = true;

    // Show instructions to the user
    setTimeout(() => {
      this.tokenLoading = false;
      this.tokenResult =
        'The Azure DevOps token page has been opened in a new tab.\n\n' +
        '1. Click "+ New Token"\n' +
        '2. Set a name (e.g. "MVA MW Tool")\n' +
        '3. Set the expiration as needed\n' +
        '4. Select the required scopes (Read for Build, Release, Code)\n' +
        '5. Click "Create"\n' +
        '6. Copy the generated token and paste it below.';
    }, 1000);
  }

  pastedToken: string = '';

  onTokenPaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text') ?? '';
    if (pasted.trim()) {
      this.pastedToken = pasted.trim();
    }
  }

  copyToken(): void {
    if (!this.pastedToken) return;
    navigator.clipboard.writeText(this.pastedToken).then(() => {
      this.tokenCopied = true;
      setTimeout(() => (this.tokenCopied = false), 2000);
    });
  }

  /** Download the CloudWatch Log Extractor Chrome Extension as a zip */
  downloadExtension(): void {
    // We'll create the zip dynamically using JSZip loaded from CDN, or
    // simply redirect to the assets folder for manual download.
    // For simplicity, we'll download the extension folder as individual files
    // bundled in a zip using JavaScript.
    this.createExtensionZip();
  }

  toggleHelp(): void {
    this.showExtensionHelp = !this.showExtensionHelp;
  }

  private async createExtensionZip(): Promise<void> {
    // Dynamically load JSZip
    const JSZip = await this.loadJSZip();
    const zip = new JSZip();

    // Fetch extension files from assets
    const files = ['manifest.json', 'popup.html', 'popup.js'];
    const basePath = 'assets/cloudwatch-log-extractor/';

    for (const file of files) {
      try {
        const response = await fetch(basePath + file);
        const text = await response.text();
        zip.file(file, text);
      } catch (e) {
        console.error(`Failed to fetch ${file}:`, e);
      }
    }

    // Generate icon SVGs as simple PNG placeholders (base64-encoded simple red circle icon)
    const iconSvg16 = this.generateIconSvg(16);
    const iconSvg48 = this.generateIconSvg(48);
    const iconSvg128 = this.generateIconSvg(128);

    zip.file('icon16.png', await this.svgToPng(iconSvg16, 16, 16));
    zip.file('icon48.png', await this.svgToPng(iconSvg48, 48, 48));
    zip.file('icon128.png', await this.svgToPng(iconSvg128, 128, 128));

    // Generate and download
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cloudwatch-log-extractor.zip';
    a.click();
    URL.revokeObjectURL(url);
  }

  private generateIconSvg(size: number): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#E60000"/>
      <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-weight="bold" font-size="${size * 0.45}" fill="white">CW</text>
    </svg>`;
  }

  private svgToPng(svgString: string, width: number, height: number): Promise<Uint8Array> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => {
          if (b) {
            b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
          } else {
            resolve(new Uint8Array());
          }
        }, 'image/png');
      };
      img.src = url;
    });
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
