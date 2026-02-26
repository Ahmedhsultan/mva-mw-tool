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
  // ── CloudWatch extension state ──
  showExtensionHelp = false;

  // ── CloudWatch Extension ──

  downloadExtension(): void {
    this.createZip(
      'assets/cloudwatch-log-extractor/',
      ['manifest.json', 'popup.html', 'popup.js'],
      'cloudwatch-log-extractor.zip',
      'CW'
    );
  }

  toggleHelp(): void {
    this.showExtensionHelp = !this.showExtensionHelp;
  }

  // ── Zip helpers ──

  private async createZip(basePath: string, files: string[], zipName: string, iconLabel: string): Promise<void> {
    const JSZip = await this.loadJSZip();
    const zip = new JSZip();

    for (const file of files) {
      try {
        const response = await fetch(basePath + file);
        const text = await response.text();
        zip.file(file, text);
      } catch (e) {
        console.error(`Failed to fetch ${file}:`, e);
      }
    }

    const iconSvg16 = this.generateIconSvg(16, iconLabel);
    const iconSvg48 = this.generateIconSvg(48, iconLabel);
    const iconSvg128 = this.generateIconSvg(128, iconLabel);

    zip.file('icon16.png', await this.svgToPng(iconSvg16, 16, 16));
    zip.file('icon48.png', await this.svgToPng(iconSvg48, 48, 48));
    zip.file('icon128.png', await this.svgToPng(iconSvg128, 128, 128));

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    a.click();
    URL.revokeObjectURL(url);
  }

  private generateIconSvg(size: number, label: string): string {
    const bgColor = label === 'AZ' ? '#0078D4' : '#E60000';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="${bgColor}"/>
      <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-weight="bold" font-size="${size * 0.4}" fill="white">${label}</text>
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
