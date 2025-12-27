// Canvas Renderer for CacheViz
// Handles all visualization rendering using HTML5 Canvas

// Configuration matching original SVG layout
const CONFIG = {
  // Component positions (relative to canvas) - centered and larger
  cpu: { x: 40, y: 200, width: 180, height: 160 },
  cache: { x: 320, y: 20, width: 280, height: 520 },
  memory: { x: 680, y: 20, width: 280, height: 520 },

  // Cache lines
  cacheLineHeight: 50,
  cacheLineSpacing: 54,
  cacheLineWidth: 235,
  cacheLinesOffset: { x: 22, y: 58 },

  // Memory banks
  memoryBankHeight: 95,
  memoryBankSpacing: 108,
  memoryCellWidth: 52,
  memoryCellHeight: 65,
  memoryBanksOffset: { x: 10, y: 50 },

  // Wires
  wireWidth: 4,
  wireAddressWidth: 3.5,
};

// Color palettes for dark and light modes
const COLORS_DARK = {
  componentColor: '#1e293b',
  componentBorder: '#10b981',
  bgPanel: '#334155',
  bgSoft: '#1e293b',
  bgApp: '#0f172a',
  borderColor: '#475569',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  colorHit: '#10b981',
  colorMiss: '#f59e0b',
  colorReplace: '#8b5cf6',
  wireDefault: '#475569',
  wireActive: '#10b981',
  cpuCore: '#0f172a',
  memoryChip: '#1e293b',
  memoryCell: '#0f172a',
  memoryContact: '#fbbf24',
  accent: '#10b981',
  accentGlow: 'rgba(16, 185, 129, 0.3)',
  gridColor: 'rgba(148, 163, 184, 0.05)',
};

const COLORS_LIGHT = {
  componentColor: '#e2e8f0',
  componentBorder: '#059669',
  bgPanel: '#ffffff',
  bgSoft: '#f1f5f9',
  bgApp: '#f8fafc',
  borderColor: '#cbd5e1',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  colorHit: '#059669',
  colorMiss: '#d97706',
  colorReplace: '#7c3aed',
  wireDefault: '#94a3b8',
  wireActive: '#059669',
  cpuCore: '#cbd5e1',
  memoryChip: '#e2e8f0',
  memoryCell: '#f1f5f9',
  memoryContact: '#d97706',
  accent: '#059669',
  accentGlow: 'rgba(5, 150, 105, 0.2)',
  gridColor: 'rgba(71, 85, 105, 0.08)',
};

// Helper to get current color scheme
function getColors() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return COLORS_LIGHT;
  }
  return COLORS_DARK;
}

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

  // Wire paths - properly aligned to component edges
  private wirePaths: { [key: string]: { start: { x: number; y: number }; end: { x: number; y: number } } } = {
    'wire-cpu-cache-addr': { start: { x: 220, y: 269 }, end: { x: 320, y: 269 } },
    'wire-cpu-cache-data': { start: { x: 220, y: 297 }, end: { x: 320, y: 297 } },
    'wire-cache-memory-addr': { start: { x: 600, y: 239 }, end: { x: 680, y: 239 } },
    'wire-cache-memory-data': { start: { x: 600, y: 292 }, end: { x: 680, y: 292 } },
  };

  // Dynamic colors based on system preference
  private colors = getColors();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;

    // Set canvas size - more compact to fill available space better
    this.width = 1000;
    this.height = 560;
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

    // Update colors based on current system preference
    this.colors = getColors();

    // Check if resize needed
    if (this.canvas.width !== rect.width * this.dpr || this.canvas.height !== rect.height * this.dpr) {
      this.resizeCanvas();
    }

    // Clear canvas
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);

    // Scale to maintain aspect ratio
    const scale = Math.min(rect.width / this.width, rect.height / this.height);
    const offsetX = (rect.width - this.width * scale) / 2;
    const offsetY = (rect.height - this.height * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Draw background subtle grid or effect
    this.drawBackgroundEffect();

    // Draw components
    this.drawWires();
    this.drawPulses();
    this.drawCPU();
    this.drawCache();
    this.drawMemory();

    ctx.restore();
  }

  private drawBackgroundEffect() {
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.colors.gridColor;
    ctx.lineWidth = 1;

    for (let i = 0; i < this.width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, this.height);
      ctx.stroke();
    }
    for (let j = 0; j < this.height; j += 40) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(this.width, j);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  // Draw CPU component
  private drawCPU() {
    const ctx = this.ctx;
    const { x, y, width, height } = CONFIG.cpu;
    const isProcessing = this.highlights.cpuProcessing;
    const time = Date.now() / 1000; // smoother time for animations

    // Subtle breathing pulse effect when processing
    const pulseIntensity = isProcessing ? 0.3 + Math.sin(time * 3) * 0.15 : 0;

    // CPU Shadow - more subtle when processing
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;

    // CPU body with gradient
    const cpuGradient = ctx.createLinearGradient(x, y, x, y + height);
    cpuGradient.addColorStop(0, this.colors.componentColor);
    cpuGradient.addColorStop(1, this.colors.cpuCore);
    ctx.fillStyle = cpuGradient;
    ctx.strokeStyle = this.colors.accent;
    ctx.lineWidth = 2;
    this.roundRect(x, y, width, height, 16);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // CPU pins (left side) - consistent color, don't change with state
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = this.colors.wireDefault;
      this.roundRect(x - 12, y + 20 + i * 28, 8, 14, 2);
      ctx.fill();
    }
    // CPU pins (right side)
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = this.colors.wireDefault;
      this.roundRect(x + width + 4, y + 20 + i * 28, 8, 14, 2);
      ctx.fill();
    }

    // CPU core - subtle glow only when processing
    const coreX = x + 40;
    const coreY = y + 40;
    const coreW = 100;
    const coreH = 80;

    // Draw a subtle glow ring around core when processing
    if (isProcessing) {
      ctx.save();
      ctx.shadowColor = this.colors.accent;
      ctx.shadowBlur = 12 + Math.sin(time * 4) * 4;
      ctx.strokeStyle = this.colors.accent;
      ctx.globalAlpha = pulseIntensity;
      ctx.lineWidth = 3;
      this.roundRect(coreX - 2, coreY - 2, coreW + 4, coreH + 4, 14);
      ctx.stroke();
      ctx.restore();
    }

    // Core background gradient
    const coreGradient = ctx.createRadialGradient(
      x + 90, y + 80, 10,
      x + 90, y + 80, 60
    );
    coreGradient.addColorStop(0, this.colors.componentColor);
    coreGradient.addColorStop(1, this.colors.cpuCore);
    ctx.fillStyle = coreGradient;
    ctx.strokeStyle = this.colors.borderColor;
    ctx.lineWidth = 2;
    this.roundRect(coreX, coreY, coreW, coreH, 12);
    ctx.fill();
    ctx.stroke();

    // Animated core circuit lines - centered in core
    const lineTime = Date.now() / 200;
    for (let i = 0; i < 3; i++) {
      const lineY = coreY + 20 + i * 20;
      const animOffset = isProcessing ? Math.sin(lineTime + i * 0.8) * 5 : 0;
      const lineLen = isProcessing ? 50 + Math.sin(lineTime + i) * 8 : 60;
      const startX = coreX + (coreW - lineLen) / 2 + animOffset;

      // Line color - subtle pulse when processing
      if (isProcessing) {
        ctx.strokeStyle = this.colors.accent;
        ctx.globalAlpha = 0.6 + Math.sin(lineTime + i * 1.2) * 0.3;
      } else {
        ctx.strokeStyle = this.colors.accent;
        ctx.globalAlpha = 0.4;
      }

      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, lineY);
      ctx.lineTo(startX + lineLen, lineY);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // CPU label - perfectly centered
    ctx.fillStyle = this.colors.textPrimary;
    ctx.font = 'bold 16px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CPU', x + width / 2, y + height - 18);
    ctx.textBaseline = 'alphabetic'; // reset
  }

  // Draw Cache component
  private drawCache() {
    const ctx = this.ctx;
    const { x, y, width, height } = CONFIG.cache;

    // Cache Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;

    // Cache body
    ctx.fillStyle = this.colors.componentColor;
    ctx.strokeStyle = this.colors.componentBorder;
    ctx.lineWidth = 2;
    this.roundRect(x, y, width, height, 20);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Cache label - perfectly centered
    ctx.fillStyle = this.colors.textPrimary;
    ctx.font = 'bold 16px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Cache', x + width / 2, y + 28);
    ctx.textBaseline = 'alphabetic'; // reset

    // Draw set grouping backgrounds for set-associative mode
    if (this.mode === 'set-associative') {
      const numSets = this.cacheLines.length / this.associativity;
      const linesX = x + CONFIG.cacheLinesOffset.x;
      const linesY = y + CONFIG.cacheLinesOffset.y;

      for (let setIdx = 0; setIdx < numSets; setIdx++) {
        const setY = linesY + setIdx * this.associativity * CONFIG.cacheLineSpacing;
        const setHeight = this.associativity * CONFIG.cacheLineSpacing - 4;

        ctx.fillStyle = setIdx % 2 === 0 ? 'rgba(148, 163, 184, 0.05)' : 'rgba(148, 163, 184, 0.1)';
        this.roundRect(linesX - 8, setY, CONFIG.cacheLineWidth + 16, setHeight, 12);
        ctx.fill();

        // Set divider
        if (setIdx < numSets - 1) {
          ctx.strokeStyle = this.colors.borderColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(linesX - 8, setY + setHeight + 2);
          ctx.lineTo(linesX + CONFIG.cacheLineWidth + 8, setY + setHeight + 2);
          ctx.stroke();
          ctx.setLineDash([]);
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
    let fillColor = line.valid ? this.colors.bgPanel : this.colors.cpuCore;
    let strokeColor = this.colors.borderColor;
    let strokeWidth = 1;
    let translateX = 0;

    // Check for highlights/animations
    if (this.highlights.cacheLineFlash === index) {
      fillColor = this.colors.accentGlow;
      strokeColor = this.colors.colorHit;
      strokeWidth = 2;
    } else if (this.highlights.cacheLineReplacing === index) {
      fillColor = 'rgba(245, 158, 11, 0.2)';
      strokeColor = this.colors.colorMiss;
      strokeWidth = 2;
    } else if (this.highlights.cacheLineTarget === index) {
      strokeColor = '#38bdf8';
      strokeWidth = 2;
    }

    // Hover effect
    if (this.hoveredCacheLine === index && line.valid) {
      strokeColor = this.colors.colorHit;
      translateX = 4;
      ctx.shadowColor = this.colors.accentGlow;
      ctx.shadowBlur = 10;
    }

    // Draw line background
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;

    if (!line.valid) {
      ctx.setLineDash([4, 4]);
    }

    this.roundRect(x + translateX, y, width, height, 8);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Draw line content
    const tagStr = line.valid ? `0x${line.tag?.toString(16).toUpperCase()}` : '-';
    let displayData = line.valid ? (line.data || '-') : 'Empty';
    if (displayData.length > 18) displayData = displayData.substring(0, 18) + '…';
    const validBit = line.valid ? '1' : '0';

    // Line index label
    ctx.font = '700 10px "Outfit", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = this.colors.textSecondary;
    ctx.fillText(`L${index}`, x + translateX + 10, y + 18);

    // Valid bit
    ctx.fillStyle = line.valid ? this.colors.colorHit : this.colors.textSecondary;
    ctx.fillText(`V: ${validBit}`, x + translateX + 10, y + 36);

    // TAG
    ctx.fillStyle = this.colors.textSecondary;
    ctx.fillText('TAG', x + translateX + 50, y + 18);
    ctx.fillStyle = line.valid ? this.colors.textPrimary : this.colors.textSecondary;
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.fillText(tagStr, x + translateX + 50, y + 36);

    // DATA
    ctx.font = '700 10px "Outfit", sans-serif';
    ctx.fillStyle = this.colors.textSecondary;
    ctx.fillText('DATA', x + translateX + 115, y + 18);
    ctx.fillStyle = line.valid ? this.colors.textPrimary : this.colors.textSecondary;
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText(displayData, x + translateX + 115, y + 36);
  }

  // Draw Memory component
  private drawMemory() {
    const ctx = this.ctx;
    const { x, y, width, height } = CONFIG.memory;

    // Memory Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;

    // Memory body (RAM PCB)
    ctx.fillStyle = this.colors.componentColor;
    ctx.strokeStyle = this.colors.componentBorder;
    ctx.lineWidth = 2.5;
    this.roundRect(x, y, width, height, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Memory label - perfectly centered
    ctx.fillStyle = this.colors.textPrimary;
    ctx.font = 'bold 16px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Main Memory', x + width / 2, y + 28);
    ctx.textBaseline = 'alphabetic'; // reset

    // Bottom notch (centered)
    const notchWidth = 36;
    const notchX = x + (width - notchWidth) / 2;
    ctx.fillStyle = this.colors.bgApp;
    ctx.fillRect(notchX, y + height - 8, notchWidth, 8);

    // Gold contacts - perfectly evenly spaced
    ctx.fillStyle = this.colors.memoryContact;
    const contactWidth = 12;
    const contactHeight = 12;
    const leftPadding = 16;
    const rightPadding = 16;
    const availableWidth = width - leftPadding - rightPadding;
    const contactsLeft = 7;  // contacts on left of notch
    const contactsRight = 7; // contacts on right of notch

    // Left side contacts
    const leftAreaWidth = (width / 2) - (notchWidth / 2) - leftPadding - 4;
    const leftSpacing = leftAreaWidth / contactsLeft;
    for (let i = 0; i < contactsLeft; i++) {
      const cx = x + leftPadding + i * leftSpacing + leftSpacing / 2 - contactWidth / 2;
      ctx.fillRect(cx, y + height - contactHeight, contactWidth, contactHeight);
    }

    // Right side contacts
    const rightStartX = x + width / 2 + notchWidth / 2 + 4;
    const rightAreaWidth = (width / 2) - (notchWidth / 2) - rightPadding - 4;
    const rightSpacing = rightAreaWidth / contactsRight;
    for (let i = 0; i < contactsRight; i++) {
      const cx = rightStartX + i * rightSpacing + rightSpacing / 2 - contactWidth / 2;
      ctx.fillRect(cx, y + height - contactHeight, contactWidth, contactHeight);
    }

    // Memory banks
    const banksX = x + CONFIG.memoryBanksOffset.x;
    const banksY = y + CONFIG.memoryBanksOffset.y;

    for (let bankIdx = 0; bankIdx < 4; bankIdx++) {
      const bankY = banksY + bankIdx * CONFIG.memoryBankSpacing;
      const isHighlighted = this.highlights.memoryBankHighlight === bankIdx;

      // Memory chip
      ctx.fillStyle = isHighlighted ? this.colors.borderColor : this.colors.memoryChip;
      ctx.strokeStyle = isHighlighted ? this.colors.colorHit : this.colors.borderColor;
      ctx.lineWidth = isHighlighted ? 2 : 1;
      this.roundRect(banksX, bankY, 260, CONFIG.memoryBankHeight, 8);
      ctx.fill();
      ctx.stroke();

      // Memory cells
      for (let cellIdx = 0; cellIdx < 4; cellIdx++) {
        const cellX = banksX + 15 + cellIdx * 60;
        const cellY = bankY + 15;
        const isHighlightedCell = isHighlighted && this.highlights.memoryCellHighlight === cellIdx;

        ctx.fillStyle = isHighlightedCell ? this.colors.accentGlow : this.colors.memoryCell;
        ctx.strokeStyle = isHighlightedCell ? this.colors.colorHit : this.colors.bgPanel;
        ctx.lineWidth = isHighlightedCell ? 1.5 : 1;
        this.roundRect(cellX, cellY, CONFIG.memoryCellWidth, CONFIG.memoryCellHeight, 6);
        ctx.fill();
        ctx.stroke();

        // Cell data
        const blockIndex = bankIdx * 4 + cellIdx;
        if (blockIndex < this.memoryBlocks.length) {
          const data = this.memoryBlocks[blockIndex].data.substring(0, 6);
          ctx.fillStyle = this.colors.textPrimary;
          ctx.font = '700 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(data, cellX + 25, cellY + 38);
        }
      }
    }
  }

  // Draw wires with animated dashes (bidirectional - thicker and more visible)
  private drawWires() {
    const ctx = this.ctx;
    const time = Date.now() / 40;

    Object.entries(this.wirePaths).forEach(([wireId, path]) => {
      const isActive = this.highlights.wireActive[wireId];
      const isAddress = wireId.includes('addr');

      // Draw outer glow when active
      if (isActive) {
        ctx.strokeStyle = isAddress ? 'rgba(251, 191, 36, 0.3)' : this.colors.accentGlow;
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(path.start.x, path.start.y);
        ctx.lineTo(path.end.x, path.end.y);
        ctx.stroke();
      }

      // Base wire (thicker background)
      ctx.strokeStyle = isActive
        ? (isAddress ? 'rgba(251, 191, 36, 0.5)' : this.colors.accentGlow)
        : this.colors.bgPanel;
      ctx.lineWidth = isAddress ? 6 : 7;
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(path.start.x, path.start.y);
      ctx.lineTo(path.end.x, path.end.y);
      ctx.stroke();

      // Main wire with animation
      ctx.strokeStyle = isActive
        ? (isAddress ? '#fbbf24' : this.colors.colorHit)
        : this.colors.wireDefault;
      ctx.lineWidth = isAddress ? 4 : 5;
      ctx.lineCap = 'round';

      if (isActive) {
        // Animated dash pattern - faster and more dynamic
        ctx.setLineDash([12, 10]);
        ctx.lineDashOffset = -time;
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(path.start.x, path.start.y);
      ctx.lineTo(path.end.x, path.end.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw bidirectional arrows (two small triangles pointing opposite directions)
      const midX = (path.start.x + path.end.x) / 2;
      const midY = (path.start.y + path.end.y) / 2;
      const arrowSize = 6;
      const arrowGap = 8;

      ctx.fillStyle = isActive ? (isAddress ? '#fbbf24' : this.colors.colorHit) : this.colors.wireDefault;

      // Right arrow (pointing right)
      ctx.beginPath();
      ctx.moveTo(midX + arrowGap, midY);
      ctx.lineTo(midX + arrowGap - arrowSize, midY - arrowSize / 2);
      ctx.lineTo(midX + arrowGap - arrowSize, midY + arrowSize / 2);
      ctx.closePath();
      ctx.fill();

      // Left arrow (pointing left)
      ctx.beginPath();
      ctx.moveTo(midX - arrowGap, midY);
      ctx.lineTo(midX - arrowGap + arrowSize, midY - arrowSize / 2);
      ctx.lineTo(midX - arrowGap + arrowSize, midY + arrowSize / 2);
      ctx.closePath();
      ctx.fill();
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
      let headColor = '#fbbf24'; // Warning orange/yellow
      let tailColor = 'rgba(251, 191, 36, 0.4)';
      let headRadius = 7;

      if (pulse.variant === 'hit-return') {
        headColor = '#10b981'; // Emerald green
        tailColor = 'rgba(16, 185, 129, 0.4)';
        headRadius = 9;
      } else if (pulse.variant === 'miss-return') {
        headColor = '#0ea5e9'; // Sky blue
        tailColor = 'rgba(14, 165, 233, 0.4)';
        headRadius = 9;
      } else if (pulse.variant === 'address') {
        headColor = '#f59e0b'; // Amber
        tailColor = 'rgba(245, 158, 11, 0.4)';
        headRadius = 6;
      }

      // Draw tail glow
      ctx.shadowColor = headColor;
      ctx.shadowBlur = headRadius * 1.5;
      ctx.strokeStyle = tailColor;
      ctx.lineWidth = pulse.variant?.includes('return') ? 5 : 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();

      // Draw head with intense glow
      ctx.shadowBlur = headRadius * 2;
      ctx.fillStyle = headColor;
      ctx.beginPath();
      ctx.arc(headX, headY, headRadius * (1.1 + Math.sin(Date.now() / 100) * 0.1), 0, Math.PI * 2);
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
