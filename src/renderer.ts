// Canvas Renderer for CacheViz
// Handles all visualization rendering using HTML5 Canvas

// Configuration matching original SVG layout
const CONFIG = {
  // Component positions (relative to canvas)
  cpu: { x: 80, y: 225, width: 180, height: 160 },
  cache: { x: 395, y: 35, width: 278, height: 532 },
  memory: { x: 760, y: 35, width: 290, height: 530 },

  // Cache lines
  cacheLineHeight: 52,
  cacheLineSpacing: 56,
  cacheLineWidth: 230,
  cacheLinesOffset: { x: 24, y: 62 },

  // Memory banks
  memoryBankHeight: 95,
  memoryBankSpacing: 110,
  memoryCellWidth: 50,
  memoryCellHeight: 65,
  memoryBanksOffset: { x: 15, y: 52 },

  // Wires
  wireWidth: 4,
  wireAddressWidth: 3.5,

  // Colors
  colors: {
    componentColor: '#1e6b28',
    componentBorder: '#14501d',
    bgPanel: '#ffffff',
    bgSoft: '#f1f3f5',
    borderColor: '#dee2e6',
    textPrimary: '#212529',
    textSecondary: '#495057',
    colorHit: '#28a745',
    colorMiss: '#fd7e14',
    colorReplace: '#6f42c1',
    wireDefault: '#c8d0d8',
    wireActive: '#ffa726',
    cpuCore: '#2e7d32',
    memoryChip: '#5a6268',
    memoryCell: '#3d4347',
    memoryContact: '#f4a261',
  }
};

// Animation state
interface PulseState {
  active: boolean;
  progress: number;
  pathId: string;
  variant: string;
  reverse: boolean;
  startTime: number;
  duration: number;
  resolve: (() => void) | null;
}

interface HighlightState {
  cacheLineFlash: number | null;
  cacheLineReplacing: number | null;
  cacheLineUpdating: number | null;
  cacheLineTarget: number | null;
  cacheSetHighlight: number[] | null;
  memoryBankHighlight: number | null;
  memoryCellHighlight: number | null;
  cpuProcessing: boolean;
  wireActive: { [key: string]: boolean };
}

interface CacheLine {
  valid: boolean;
  tag: number | null;
  data: string | null;
  lastAccess: number | null;
}

interface MemoryBlock {
  address: number;
  data: string;
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private width: number;
  private height: number;

  // Animation states
  private pulses: { [key: string]: PulseState } = {};
  private highlights: HighlightState = {
    cacheLineFlash: null,
    cacheLineReplacing: null,
    cacheLineUpdating: null,
    cacheLineTarget: null,
    cacheSetHighlight: null,
    memoryBankHighlight: null,
    memoryCellHighlight: null,
    cpuProcessing: false,
    wireActive: {},
  };

  // Data state (updated from app.ts)
  private cacheLines: CacheLine[] = [];
  private memoryBlocks: MemoryBlock[] = [];
  private mode: 'direct' | 'set-associative' | 'fully-associative' = 'fully-associative';
  private associativity: number = 2;

  // Tooltip state
  private hoveredCacheLine: number | null = null;
  private mousePos: { x: number; y: number } = { x: 0, y: 0 };

  // Animation frame
  private animationFrameId: number | null = null;

  // Wire paths (simplified as line segments)
  private wirePaths: { [key: string]: { start: { x: number; y: number }; end: { x: number; y: number } } } = {
    'wire-cpu-cache-addr': { start: { x: 260, y: 271 }, end: { x: 395, y: 271 } },
    'wire-cpu-cache-data': { start: { x: 260, y: 327 }, end: { x: 395, y: 327 } },
    'wire-cache-memory-addr': { start: { x: 673, y: 271 }, end: { x: 760, y: 271 } },
    'wire-cache-memory-data': { start: { x: 673, y: 327 }, end: { x: 760, y: 327 } },
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;

    // Set canvas size
    this.width = 1100;
    this.height = 680;
    this.resizeCanvas();

    // Start animation loop
    this.startAnimationLoop();

    // Setup mouse events for tooltips
    this.setupMouseEvents();
  }

  private resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  private setupMouseEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const scaleY = this.height / rect.height;
      this.mousePos.x = (e.clientX - rect.left) * scaleX;
      this.mousePos.y = (e.clientY - rect.top) * scaleY;

      // Check if hovering over cache line
      this.hoveredCacheLine = this.getCacheLineAtPoint(this.mousePos.x, this.mousePos.y);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredCacheLine = null;
    });
  }

  private getCacheLineAtPoint(x: number, y: number): number | null {
    const cacheX = CONFIG.cache.x + CONFIG.cacheLinesOffset.x;
    const cacheY = CONFIG.cache.y + CONFIG.cacheLinesOffset.y;

    if (x < cacheX || x > cacheX + CONFIG.cacheLineWidth) return null;

    for (let i = 0; i < this.cacheLines.length; i++) {
      const lineY = cacheY + i * CONFIG.cacheLineSpacing;
      if (y >= lineY && y <= lineY + CONFIG.cacheLineHeight) {
        return this.cacheLines[i].valid ? i : null;
      }
    }
    return null;
  }

  private startAnimationLoop() {
    const animate = () => {
      this.render();
      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }

  public destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  // Update data from app state
  public updateCache(lines: CacheLine[]) {
    this.cacheLines = lines;
  }

  public updateMemory(blocks: MemoryBlock[]) {
    this.memoryBlocks = blocks;
  }

  public updateMode(mode: 'direct' | 'set-associative' | 'fully-associative', associativity: number = 2) {
    this.mode = mode;
    this.associativity = associativity;
  }

  // Main render function
  private render() {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Scale to maintain aspect ratio
    const scale = Math.min(rect.width / this.width, rect.height / this.height);
    const offsetX = (rect.width - this.width * scale) / 2;
    const offsetY = (rect.height - this.height * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Draw components
    this.drawWires();
    this.drawPulses();
    this.drawCPU();
    this.drawCache();
    this.drawMemory();

    ctx.restore();
  }

  // Draw CPU component
  private drawCPU() {
    const ctx = this.ctx;
    const { x, y, width, height } = CONFIG.cpu;

    // CPU body
    ctx.fillStyle = CONFIG.colors.componentColor;
    this.roundRect(x, y, width, height, 20);
    ctx.fill();

    // CPU pins (left side)
    ctx.fillStyle = 'rgba(27, 94, 32, 0.45)';
    for (let i = 0; i < 5; i++) {
      this.roundRect(x - 14, y + 18 + i * 28, 10, 16, 2);
      ctx.fill();
    }
    // CPU pins (right side)
    for (let i = 0; i < 5; i++) {
      this.roundRect(x + width + 4, y + 18 + i * 28, 10, 16, 2);
      ctx.fill();
    }

    // CPU core
    const coreStyle = this.highlights.cpuProcessing
      ? this.lerpColor(CONFIG.colors.cpuCore, '#1e6b28', Math.sin(Date.now() / 150) * 0.5 + 0.5)
      : CONFIG.colors.cpuCore;
    ctx.fillStyle = coreStyle;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    this.roundRect(x + 40, y + 40, 100, 80, 16);
    ctx.fill();
    ctx.stroke();

    // Core lines
    const lineOpacity = this.highlights.cpuProcessing ? 1 : 0.7;
    ctx.strokeStyle = `rgba(255, 255, 255, ${lineOpacity * 0.8})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 50, y + 60 + i * 20);
      ctx.lineTo(x + 130, y + 60 + i * 20);
      ctx.stroke();
    }

    // CPU label
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CPU', x + width / 2, y + height - 15);
  }

  // Draw Cache component
  private drawCache() {
    const ctx = this.ctx;
    const { x, y, width, height } = CONFIG.cache;

    // Cache body
    ctx.fillStyle = CONFIG.colors.componentColor;
    ctx.strokeStyle = CONFIG.colors.componentBorder;
    ctx.lineWidth = 2;
    this.roundRect(x, y, width, height, 20);
    ctx.fill();
    ctx.stroke();

    // Cache label
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Cache', x + width / 2, y + 36);

    // Draw set grouping backgrounds for set-associative mode
    if (this.mode === 'set-associative') {
      const numSets = this.cacheLines.length / this.associativity;
      const linesX = x + CONFIG.cacheLinesOffset.x;
      const linesY = y + CONFIG.cacheLinesOffset.y;

      for (let setIdx = 0; setIdx < numSets; setIdx++) {
        const setY = linesY + setIdx * this.associativity * CONFIG.cacheLineSpacing;
        const setHeight = this.associativity * CONFIG.cacheLineSpacing - 4;

        ctx.fillStyle = setIdx % 2 === 0 ? 'rgba(27, 94, 32, 0.03)' : 'rgba(27, 94, 32, 0.08)';
        this.roundRect(linesX - 8, setY, CONFIG.cacheLineWidth + 16, setHeight, 8);
        ctx.fill();

        // Set divider
        if (setIdx < numSets - 1) {
          ctx.strokeStyle = CONFIG.colors.componentColor;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 3]);
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(linesX - 8, setY + setHeight + 2);
          ctx.lineTo(linesX + CONFIG.cacheLineWidth + 8, setY + setHeight + 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Draw cache lines
    this.cacheLines.forEach((line, index) => {
      this.drawCacheLine(index, line);
    });
  }

  private drawCacheLine(index: number, line: CacheLine) {
    const ctx = this.ctx;
    const x = CONFIG.cache.x + CONFIG.cacheLinesOffset.x;
    const y = CONFIG.cache.y + CONFIG.cacheLinesOffset.y + index * CONFIG.cacheLineSpacing;
    const width = CONFIG.cacheLineWidth;
    const height = CONFIG.cacheLineHeight;

    // Determine line style based on state
    let fillColor = line.valid ? CONFIG.colors.bgPanel : CONFIG.colors.bgSoft;
    let strokeColor = CONFIG.colors.borderColor;
    let strokeWidth = 1.5;
    let translateX = 0;

    // Check for highlights/animations
    if (this.highlights.cacheLineFlash === index) {
      const t = Math.sin(Date.now() / 100) * 0.5 + 0.5;
      fillColor = this.lerpColor(CONFIG.colors.bgPanel, 'rgba(40, 167, 69, 0.5)', t);
      strokeColor = CONFIG.colors.colorHit;
      strokeWidth = 2.5;
    } else if (this.highlights.cacheLineReplacing === index) {
      fillColor = 'rgba(255, 193, 7, 0.4)';
      strokeColor = '#ffc107';
      strokeWidth = 2.5;
    } else if (this.highlights.cacheLineUpdating === index) {
      fillColor = CONFIG.colors.bgPanel;
    } else if (this.highlights.cacheLineTarget === index) {
      strokeColor = CONFIG.colors.colorMiss;
      strokeWidth = 2.5;
    } else if (this.highlights.cacheSetHighlight?.includes(index)) {
      strokeColor = CONFIG.colors.componentColor;
      strokeWidth = 2;
    }

    // Hover effect
    if (this.hoveredCacheLine === index && line.valid) {
      strokeColor = CONFIG.colors.componentColor;
      translateX = 4;
    }

    // Draw line background
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;

    if (!line.valid) {
      ctx.setLineDash([4, 3]);
    }

    this.roundRect(x + translateX, y, width, height, 6);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw line content
    const tagStr = line.valid ? `0x${line.tag?.toString(16).toUpperCase()}` : '-';
    let displayData = line.valid ? (line.data || '-') : '-';
    if (displayData.length > 18) displayData = displayData.substring(0, 18) + '…';
    const validStr = line.valid ? 'V: 1' : 'V: 0';

    // Line index label
    ctx.fillStyle = CONFIG.colors.textSecondary;
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`L${index}`, x + translateX + 10, y + 20);

    // Valid bit
    ctx.fillStyle = line.valid ? CONFIG.colors.colorHit : CONFIG.colors.textSecondary;
    ctx.font = 'bold 11px Monaco, Menlo, monospace';
    ctx.fillText(validStr, x + translateX + 10, y + 38);

    // TAG label and value
    ctx.fillStyle = CONFIG.colors.textSecondary;
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText('TAG', x + translateX + 50, y + 20);
    ctx.fillStyle = CONFIG.colors.textPrimary;
    ctx.font = 'bold 13px Monaco, Menlo, monospace';
    ctx.fillText(tagStr, x + translateX + 50, y + 38);

    // DATA label and value
    ctx.fillStyle = CONFIG.colors.textSecondary;
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText('DATA', x + translateX + 115, y + 20);
    ctx.fillStyle = CONFIG.colors.textPrimary;
    ctx.font = 'bold 11px Monaco, Menlo, monospace';
    ctx.fillText(displayData, x + translateX + 115, y + 38);
  }

  // Draw Memory component
  private drawMemory() {
    const ctx = this.ctx;
    const { x, y, width, height } = CONFIG.memory;

    // Memory body (RAM PCB)
    ctx.fillStyle = CONFIG.colors.componentColor;
    ctx.strokeStyle = CONFIG.colors.componentBorder;
    ctx.lineWidth = 2.5;
    this.roundRect(x, y, width, height, 12);
    ctx.fill();
    ctx.stroke();

    // Memory label
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Main Memory', x + width / 2, y + 36);

    // Circuit traces
    ctx.strokeStyle = 'rgba(27, 94, 32, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    const traceYs = [25, 155, 285, 415, 505];
    traceYs.forEach(traceY => {
      ctx.beginPath();
      ctx.moveTo(x + 15, y + traceY);
      ctx.lineTo(x + 275, y + traceY);
      ctx.stroke();
    });

    // Bottom notch
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(x + 125, y + height - 8, 40, 8);

    // Gold contacts
    ctx.fillStyle = CONFIG.colors.memoryContact;
    ctx.strokeStyle = '#d18e54';
    ctx.lineWidth = 0.5;
    const contactXs = [20, 35, 50, 65, 80, 95, 110, 170, 185, 200, 215, 230, 245, 260];
    contactXs.forEach(cx => {
      ctx.fillRect(x + cx, y + height - 10, 8, 10);
    });

    // Memory banks
    const banksX = x + CONFIG.memoryBanksOffset.x;
    const banksY = y + CONFIG.memoryBanksOffset.y;

    for (let bankIdx = 0; bankIdx < 4; bankIdx++) {
      const bankY = banksY + bankIdx * CONFIG.memoryBankSpacing;
      const isHighlighted = this.highlights.memoryBankHighlight === bankIdx;

      // Memory chip
      ctx.fillStyle = isHighlighted ? '#6c757d' : CONFIG.colors.memoryChip;
      ctx.strokeStyle = isHighlighted ? CONFIG.colors.componentColor : '#3d4347';
      ctx.lineWidth = isHighlighted ? 2.5 : 2;
      this.roundRect(banksX, bankY, 260, CONFIG.memoryBankHeight, 8);
      ctx.fill();
      ctx.stroke();

      // Memory cells
      for (let cellIdx = 0; cellIdx < 4; cellIdx++) {
        const cellX = banksX + 15 + cellIdx * 60;
        const cellY = bankY + 15;
        const isHighlightedCell = isHighlighted && this.highlights.memoryCellHighlight === cellIdx;

        ctx.fillStyle = isHighlightedCell ? 'rgba(27, 94, 32, 0.18)' : CONFIG.colors.memoryCell;
        ctx.strokeStyle = isHighlightedCell ? CONFIG.colors.componentColor : '#2a2e32';
        ctx.lineWidth = isHighlightedCell ? 2 : 1.5;
        this.roundRect(cellX, cellY, CONFIG.memoryCellWidth, CONFIG.memoryCellHeight, 4);
        ctx.fill();
        ctx.stroke();

        // Cell data
        const blockIndex = bankIdx * 4 + cellIdx;
        if (blockIndex < this.memoryBlocks.length) {
          const data = this.memoryBlocks[blockIndex].data.substring(0, 6);
          ctx.fillStyle = '#e8f5e9';
          ctx.font = 'bold 11px Monaco, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(data, cellX + 25, cellY + 38);

          ctx.fillStyle = '#a0a8ad';
          ctx.globalAlpha = 0.7;
          ctx.font = '500 8px Monaco, Menlo, monospace';
          ctx.fillText('(data)', cellX + 25, cellY + 52);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  // Draw wires
  private drawWires() {
    const ctx = this.ctx;

    Object.entries(this.wirePaths).forEach(([wireId, path]) => {
      const isActive = this.highlights.wireActive[wireId];
      const isAddress = wireId.includes('addr');

      ctx.strokeStyle = isActive
        ? (isAddress ? '#ffa726' : CONFIG.colors.componentColor)
        : CONFIG.colors.wireDefault;
      ctx.lineWidth = isAddress ? CONFIG.wireAddressWidth : CONFIG.wireWidth;
      ctx.lineCap = 'round';

      if (isActive) {
        ctx.shadowColor = isAddress ? '#ffa726' : CONFIG.colors.componentColor;
        ctx.shadowBlur = 10;
      }

      ctx.beginPath();
      ctx.moveTo(path.start.x, path.start.y);
      ctx.lineTo(path.end.x, path.end.y);
      ctx.stroke();

      ctx.shadowBlur = 0;
    });
  }

  // Draw pulse animations
  private drawPulses() {
    const ctx = this.ctx;
    const now = performance.now();

    Object.entries(this.pulses).forEach(([pulseId, pulse]) => {
      if (!pulse.active) return;

      const elapsed = now - pulse.startTime;
      let progress = Math.min(elapsed / pulse.duration, 1);

      // Easing
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const path = this.wirePaths[pulse.pathId];
      if (!path) return;

      const t = pulse.reverse ? 1 - eased : eased;
      const headX = path.start.x + (path.end.x - path.start.x) * t;
      const headY = path.start.y + (path.end.y - path.start.y) * t;

      const tailOffset = 0.15;
      const tailT = Math.max(0, t - tailOffset);
      const tailX = path.start.x + (path.end.x - path.start.x) * tailT;
      const tailY = path.start.y + (path.end.y - path.start.y) * tailT;

      // Determine colors based on variant
      let headColor = '#ffc76b';
      let tailColor = 'rgba(255, 199, 107, 0.85)';
      let headRadius = 7;

      if (pulse.variant === 'hit-return') {
        headColor = '#2fd86f';
        tailColor = 'rgba(47, 216, 111, 0.9)';
        headRadius = 10;
      } else if (pulse.variant === 'miss-return') {
        headColor = '#40c4ff';
        tailColor = 'rgba(64, 196, 255, 0.9)';
        headRadius = 10;
      } else if (pulse.variant === 'address') {
        headColor = '#ffc76b';
        tailColor = 'rgba(255, 199, 107, 0.85)';
      }

      // Draw tail
      ctx.strokeStyle = tailColor;
      ctx.lineWidth = pulse.variant?.includes('return') ? 4.6 : 3;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.7 - 0.3 * progress;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Draw head with glow
      ctx.shadowColor = headColor;
      ctx.shadowBlur = 12;
      ctx.fillStyle = headColor;
      ctx.beginPath();
      ctx.arc(headX, headY, headRadius * (1.05 + 0.15 * (1 - progress)), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Check if animation complete
      if (progress >= 1) {
        pulse.active = false;
        if (pulse.resolve) {
          pulse.resolve();
          pulse.resolve = null;
        }
      }
    });
  }

  // Animation control methods
  public animatePulse(pulseId: string, pathId: string, duration: number, variant: string = '', reverse: boolean = false): Promise<void> {
    return new Promise((resolve) => {
      this.pulses[pulseId] = {
        active: true,
        progress: 0,
        pathId,
        variant,
        reverse,
        startTime: performance.now(),
        duration,
        resolve,
      };
    });
  }

  public activateWire(wireId: string, duration: number = 600) {
    this.highlights.wireActive[wireId] = true;
    setTimeout(() => {
      this.highlights.wireActive[wireId] = false;
    }, duration);
  }

  public flashCacheLine(lineIndex: number, duration: number = 350): Promise<void> {
    return new Promise((resolve) => {
      this.highlights.cacheLineFlash = lineIndex;
      setTimeout(() => {
        this.highlights.cacheLineFlash = null;
        resolve();
      }, duration);
    });
  }

  public setCacheLineReplacing(lineIndex: number | null) {
    this.highlights.cacheLineReplacing = lineIndex;
  }

  public setCacheLineUpdating(lineIndex: number | null) {
    this.highlights.cacheLineUpdating = lineIndex;
  }

  public setCacheLineTarget(lineIndex: number | null) {
    this.highlights.cacheLineTarget = lineIndex;
  }

  public setCacheSetHighlight(indices: number[] | null) {
    this.highlights.cacheSetHighlight = indices;
  }

  public highlightMemory(bankIndex: number, cellIndex: number) {
    this.highlights.memoryBankHighlight = bankIndex;
    this.highlights.memoryCellHighlight = cellIndex;
  }

  public clearMemoryHighlight() {
    this.highlights.memoryBankHighlight = null;
    this.highlights.memoryCellHighlight = null;
  }

  public setCpuProcessing(processing: boolean) {
    this.highlights.cpuProcessing = processing;
  }

  public async shakeCacheOnMiss(): Promise<void> {
    // Visual effect handled by flash timing
    return new Promise(resolve => setTimeout(resolve, 400));
  }

  // Tooltip data getter
  public getHoveredCacheLineData(): { index: number; line: CacheLine } | null {
    if (this.hoveredCacheLine === null) return null;
    return {
      index: this.hoveredCacheLine,
      line: this.cacheLines[this.hoveredCacheLine],
    };
  }

  // Utility methods
  private roundRect(x: number, y: number, width: number, height: number, radius: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  private lerpColor(color1: string, color2: string, t: number): string {
    // Simple color interpolation for animations
    // For simplicity, just return color2 at t > 0.5
    return t > 0.5 ? color2 : color1;
  }
}
