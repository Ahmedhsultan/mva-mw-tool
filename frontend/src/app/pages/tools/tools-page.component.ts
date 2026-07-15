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

  // LOA Token Decryption
  encryptedToken = '';
  decryptedToken = '';
  activeKey = '';
  inactiveKey = '';
  decryptError = '';
  decryptSuccess = '';
  selectedPreset = '';
  private keysLoaded = false;

  readonly keyPresets: { value: string; label: string; activeKey: string; inactiveKey: string }[] = [
    { value: 'prod', label: 'Prod', activeKey: 'G+BtMjGRzbimF4fRAmDTSEcn+1/bNqGIfwgPiXITaXw=', inactiveKey: 'test' },
    { value: 'lower', label: 'Lower', activeKey: '9/epv3H+sVjOjy3TbmPUxpAIkuw2FG9kxajg724+n3U=', inactiveKey: 'test' }
  ];

  constructor() {
    const stored = localStorage.getItem('mva_loa_keystore');
    if (stored) {
      try {
        const ks = JSON.parse(stored);
        this.selectedPreset = ks.preset || '';
        this.activeKey = ks.activeKey || '';
        this.inactiveKey = ks.inactiveKey || '';
        this.keysLoaded = true;
      } catch { /* ignore */ }
    }
  }

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

  // --- LOA Token Decryption ---

  applyPreset(value: string): void {
    this.selectedPreset = value;
    const preset = this.keyPresets.find(p => p.value === value);
    if (preset) {
      this.activeKey = preset.activeKey;
      this.inactiveKey = preset.inactiveKey;
      this.keysLoaded = true;
      localStorage.setItem('mva_loa_keystore', JSON.stringify({
        activeKey: preset.activeKey,
        inactiveKey: preset.inactiveKey,
        preset: value
      }));
    }
  }

  async decryptToken(): Promise<void> {
    this.decryptError = '';
    this.decryptSuccess = '';
    this.decryptedToken = '';

    const input = this.encryptedToken.trim();
    if (!input) return;

    if (!this.keysLoaded) {
      const stored = localStorage.getItem('mva_loa_keystore');
      if (stored) {
        try {
          const keystore = JSON.parse(stored);
          this.activeKey = keystore.activeKey || '';
          this.inactiveKey = keystore.inactiveKey || '';
          this.keysLoaded = true;
        } catch { /* ignore */ }
      }
    }

    if (!this.activeKey.trim() && !this.inactiveKey.trim()) {
      this.decryptError = 'Add secret key(s) first.';
      return;
    }

    const CryptoJS = await this.loadCryptoJS();

    try {
      this.decryptedToken = this.tryDecrypt(CryptoJS, input, this.activeKey.trim());
      this.decryptSuccess = 'Decryption succeeded.';
    } catch {
      try {
        this.decryptedToken = this.tryDecrypt(CryptoJS, input, this.inactiveKey.trim());
        this.decryptSuccess = 'Decryption succeeded (inactive key).';
      } catch {
        this.decryptError = 'Decryption failed. Check the token and keys.';
      }
    }
  }

  clearEncryptedToken(): void {
    this.encryptedToken = '';
    this.decryptedToken = '';
    this.decryptError = '';
    this.decryptSuccess = '';
  }

  clearDecryptedToken(): void {
    this.decryptedToken = '';
  }

  async copyToClipboard(text: string): Promise<void> {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.decryptSuccess = 'Copied to clipboard.';
      setTimeout(() => this.decryptSuccess = '', 2000);
    } catch {
      this.decryptError = 'Copy failed.';
    }
  }

  private tryDecrypt(CryptoJS: any, encryptedToken: string, secretKey: string): string {
    const key = CryptoJS.enc.Base64.parse(secretKey);
    const cipherTextWithIv = CryptoJS.enc.Base64.parse(encryptedToken);
    const ivLen = 16;
    const iv = CryptoJS.lib.WordArray.create(cipherTextWithIv.words.slice(0, ivLen / 4));
    const ciphertext = CryptoJS.lib.WordArray.create(cipherTextWithIv.words.slice(ivLen / 4));

    const decrypted = CryptoJS.AES.decrypt({ ciphertext }, key, { iv });

    if (decrypted.toString() === '') {
      throw new Error('Malformed data');
    }

    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  private loadCryptoJS(): Promise<any> {
    return new Promise((resolve, reject) => {
      const existing = (window as any).CryptoJS;
      if (existing) {
        resolve(existing);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js';
      script.onload = () => resolve((window as any).CryptoJS);
      script.onerror = () => reject(new Error('Failed to load CryptoJS.'));
      document.head.appendChild(script);
    });
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