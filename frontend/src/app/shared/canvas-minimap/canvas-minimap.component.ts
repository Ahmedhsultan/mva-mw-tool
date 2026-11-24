import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

export interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  tone?: string;
}

@Component({
  selector: 'app-canvas-minimap',
  standalone: true,
  template: `
    <svg #svg [attr.viewBox]="frozenViewBox ?? viewBox" preserveAspectRatio="xMidYMid meet"
      (pointerdown)="onPointerDown($event)" (pointermove)="onPointerMove($event)"
      (pointerup)="endDrag()" (pointercancel)="endDrag()">
      @for (node of nodes; track $index) {
        <rect class="mini-node" [class]="node.tone || ''" [attr.x]="node.x" [attr.y]="node.y"
          [attr.width]="node.width" [attr.height]="node.height" rx="14" />
      }
      @if (viewport) {
        <rect class="mini-viewport" [attr.x]="viewport.x" [attr.y]="viewport.y"
          [attr.width]="viewport.width" [attr.height]="viewport.height" rx="10" />
      }
    </svg>
    @if (label) { <span class="mini-label">{{ label }}</span> }
  `,
  styles: [`
    :host {
      position: absolute;
      z-index: 6;
      width: 200px;
      height: 136px;
      padding: 6px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid rgba(118, 139, 173, 0.22);
      box-shadow: 0 10px 26px rgba(49, 80, 124, 0.14);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-sizing: border-box;
    }
    svg { display: block; width: 100%; height: 100%; cursor: pointer; touch-action: none; }
    .mini-node { fill: rgba(118, 139, 173, 0.35); }
    .mini-node.is-selected, .mini-node.is-running { fill: rgba(36, 119, 255, 0.6); }
    .mini-node.is-success { fill: rgba(52, 199, 89, 0.6); }
    .mini-node.is-danger { fill: rgba(255, 59, 48, 0.55); }
    .mini-node.is-waiting { fill: rgba(255, 149, 0, 0.6); }
    .mini-viewport {
      fill: rgba(36, 119, 255, 0.08);
      stroke: rgba(36, 119, 255, 0.85);
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
    }
    .mini-label {
      position: absolute;
      right: 8px;
      bottom: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #4b5b75;
      pointer-events: none;
    }
  `]
})
export class CanvasMinimapComponent {
  @Input() nodes: MinimapRect[] = [];
  @Input() viewport: MinimapRect | null = null;
  @Input() label = '';
  /** Emits the canvas-space point the user wants centred in the viewport. */
  @Output() navigate = new EventEmitter<{ x: number; y: number }>();
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;

  dragging = false;
  // Bounds include the viewport, so they're frozen during a drag to stop the map shifting under the pointer.
  frozenViewBox: string | null = null;

  get viewBox(): string {
    const rects = this.viewport ? [...this.nodes, this.viewport] : this.nodes;
    if (!rects.length) return '0 0 1000 680';
    const minX = Math.min(...rects.map(r => r.x));
    const minY = Math.min(...rects.map(r => r.y));
    const maxX = Math.max(...rects.map(r => r.x + r.width));
    const maxY = Math.max(...rects.map(r => r.y + r.height));
    const pad = Math.max(60, (maxX - minX) * 0.05, (maxY - minY) * 0.05);
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  }

  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.dragging = true;
    this.frozenViewBox = this.viewBox;
    this.svgRef.nativeElement.setPointerCapture(event.pointerId);
    this.emitPoint(event);
  }

  endDrag(): void {
    this.dragging = false;
    this.frozenViewBox = null;
  }

  onPointerMove(event: PointerEvent): void {
    if (this.dragging) this.emitPoint(event);
  }

  private emitPoint(event: PointerEvent): void {
    const svg = this.svgRef.nativeElement;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    this.navigate.emit({ x: point.x, y: point.y });
  }
}
