// Cache Configuration
const CACHE_SIZE = 8;
const BLOCK_SIZE = 16;
const MEMORY_BANKS = 4;
const CELLS_PER_BANK = 4;
const ASSOCIATIVITY = 2; // For N-Way Set-Associative mode

// Animation speeds (in milliseconds)
const ANIMATION_SPEED = {
  PULSE_TRAVEL: 600,
  CACHE_FLASH: 350,
  MEMORY_DELAY: 300,
  STEP_DELAY: 150,
  CPU_PROCESS: 400,
};

const LOG_ICONS = {
  hit: "✅",
  miss: "⚠️",
  replace: "🔄",
  info: "ℹ️",
};

// Types
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

interface AppState {
  cache: CacheLine[];
  memory: MemoryBlock[];
  hits: number;
  misses: number;
  isAnimating: boolean;
  nextReplacement: number;
  step: number;
  mode: "direct" | "set-associative" | "fully-associative";
  setReplacementCounters: number[];
}

// Global State
const state: AppState = {
  cache: [],
  memory: [],
  hits: 0,
  misses: 0,
  isAnimating: false,
  nextReplacement: 0,
  step: 0,
  mode: "fully-associative",
  setReplacementCounters: [],
};

// Canvas Renderer
import { CanvasRenderer } from './renderer';
let renderer: CanvasRenderer | null = null;

// DOM Cache
const dom = {
  hitCount: document.querySelector(".hit-count") as HTMLElement,
  missCount: document.querySelector(".miss-count") as HTMLElement,
  hitRate: document.querySelector(".hit-rate") as HTMLElement,
  eventLog: document.getElementById("event-log"),
  addressBreakdown: document.getElementById("address-breakdown"),
  tagValue: document.getElementById("tag-value"),
  indexSetLabel: document.getElementById("index-set-label"),
  indexSetValue: document.getElementById("index-set-value"),
  offsetValue: document.getElementById("offset-value"),
  commandInput: document.getElementById("command-input") as HTMLTextAreaElement,
  executeBtn: document.getElementById("execute-btn") as HTMLButtonElement,
  resetBtn: document.getElementById("reset-btn") as HTMLButtonElement,
  canvas: document.getElementById("visualization") as HTMLCanvasElement,
  resetModal: document.getElementById("reset-modal"),
  modalCancel: document.getElementById("modal-cancel"),
  modalConfirm: document.getElementById("modal-confirm"),
};

let tooltipElement: HTMLElement | null = null;
let announcementElement: HTMLElement | null = null;

// Screen reader announcement function
function announceToScreenReader(message: string, priority: "polite" | "assertive" = "polite") {
  if (!announcementElement) {
    announcementElement = document.createElement("div");
    announcementElement.setAttribute("aria-live", "polite");
    announcementElement.setAttribute("aria-atomic", "true");
    announcementElement.className = "sr-only";
    announcementElement.id = "sr-announcements";
    document.body.appendChild(announcementElement);
  }

  announcementElement.setAttribute("aria-live", priority);
  announcementElement.textContent = message;

  setTimeout(() => {
    if (announcementElement) announcementElement.textContent = "";
  }, 1000);
}

function generateRandomHexData(): string {
  const hexValues = [
    "DEADBEEF", "CAFEF00D", "BAADF00D", "FEEDFACE",
    "C0FFEE00", "ABAD1DEA", "DEFACED0", "FACADE00",
    "DECAFBAD", "BEEFCAFE", "F00DFACE", "C0DEC0DE",
    "BADCAB1E", "FACE1E55", "DEED5EED", "BEEF5EED",
  ];
  return hexValues[Math.floor(Math.random() * hexValues.length)];
}

// Initialize main memory with data
function initializeMemory() {
  state.memory = [];
  const totalCells = MEMORY_BANKS * CELLS_PER_BANK;
  for (let i = 0; i < totalCells; i++) {
    state.memory.push({
      address: i * BLOCK_SIZE,
      data: generateRandomHexData(),
    });
  }
  renderer?.updateMemory(state.memory);
}

// Initialize cache with empty lines
function initializeCache() {
  state.cache = [];
  for (let i = 0; i < CACHE_SIZE; i++) {
    state.cache.push({
      valid: false,
      tag: null,
      data: null,
      lastAccess: null,
    });
  }

  const numSets = CACHE_SIZE / ASSOCIATIVITY;
  state.setReplacementCounters = Array(numSets).fill(0);
  renderer?.updateCache(state.cache);
}

function parseAddress(addrStr: string): number {
  return parseInt(addrStr.replace(/0x/i, ""), 16);
}

function getOffset(address: number): number {
  return address % BLOCK_SIZE;
}

function getIndex(address: number): number {
  return Math.floor(address / BLOCK_SIZE) % CACHE_SIZE;
}

function getSet(address: number): number {
  const numSets = CACHE_SIZE / ASSOCIATIVITY;
  return Math.floor(address / BLOCK_SIZE) % numSets;
}

function getTag(address: number): number {
  const blockNumber = Math.floor(address / BLOCK_SIZE);
  if (state.mode === "direct") {
    return Math.floor(blockNumber / CACHE_SIZE);
  } else if (state.mode === "set-associative") {
    const numSets = CACHE_SIZE / ASSOCIATIVITY;
    return Math.floor(blockNumber / numSets);
  } else {
    return blockNumber;
  }
}

function scrollLeftPanelToTop() {
  const leftPanel = document.querySelector(".left-panel");
  leftPanel?.scrollTo({ top: 0, behavior: "smooth" });
}

function searchCache(tag: number, address: number): number {
  if (state.mode === "direct") {
    const index = getIndex(address);
    if (state.cache[index].valid && state.cache[index].tag === tag) return index;
    return -1;
  } else if (state.mode === "set-associative") {
    const setNum = getSet(address);
    const startIdx = setNum * ASSOCIATIVITY;
    for (let i = startIdx; i < startIdx + ASSOCIATIVITY; i++) {
      if (state.cache[i].valid && state.cache[i].tag === tag) return i;
    }
    return -1;
  } else {
    return state.cache.findIndex(line => line.valid && line.tag === tag);
  }
}

function findVictimLine(address: number): number {
  if (state.mode === "direct") return getIndex(address);
  if (state.mode === "set-associative") {
    const setNum = getSet(address);
    const startIdx = setNum * ASSOCIATIVITY;
    for (let i = startIdx; i < startIdx + ASSOCIATIVITY; i++) {
      if (!state.cache[i].valid) return i;
    }
    const victim = startIdx + state.setReplacementCounters[setNum];
    state.setReplacementCounters[setNum] = (state.setReplacementCounters[setNum] + 1) % ASSOCIATIVITY;
    return victim;
  } else {
    const emptyIdx = state.cache.findIndex(line => !line.valid);
    if (emptyIdx !== -1) return emptyIdx;
    const victim = state.nextReplacement;
    state.nextReplacement = (state.nextReplacement + 1) % CACHE_SIZE;
    return victim;
  }
}

function updateCacheLine(lineIndex: number, tag: number, data: string) {
  state.cache[lineIndex] = {
    valid: true,
    tag,
    data,
    lastAccess: state.step,
  };
  renderer?.updateCache(state.cache);
}

function updateAddressBreakdown(address: number) {
  if (!dom.addressBreakdown) return;

  if (state.mode === "fully-associative") {
    if (dom.addressBreakdown.classList.contains("visible")) {
      dom.addressBreakdown.classList.remove("visible");
      setTimeout(() => {
        if (dom.addressBreakdown) dom.addressBreakdown.style.display = "none";
      }, 300);
    }
    return;
  }

  const tag = getTag(address);
  const offset = getOffset(address);

  if (dom.tagValue) dom.tagValue.textContent = `0x${tag.toString(16).toUpperCase()}`;
  if (dom.offsetValue) dom.offsetValue.textContent = `0x${offset.toString(16).toUpperCase()}`;

  if (state.mode === "direct") {
    if (dom.indexSetLabel) dom.indexSetLabel.textContent = "INDEX";
    if (dom.indexSetValue) dom.indexSetValue.textContent = getIndex(address).toString();
  } else if (state.mode === "set-associative") {
    if (dom.indexSetLabel) dom.indexSetLabel.textContent = "SET";
    if (dom.indexSetValue) dom.indexSetValue.textContent = getSet(address).toString();
  }

  if (dom.addressBreakdown.style.display === "none") {
    dom.addressBreakdown.style.display = "block";
    dom.addressBreakdown.offsetHeight; // force reflow
    requestAnimationFrame(() => dom.addressBreakdown?.classList.add("visible"));
  }
}

function clearAddressBreakdown() {
  document.querySelectorAll(".bit-group").forEach((el) => el.classList.remove("highlight"));
}

function highlightAddressBreakdown(part: "index" | "set" | "tag") {
  clearAddressBreakdown();
  if (part === "index" || part === "set") {
    document.querySelector(".bit-index-set")?.classList.add("highlight");
  } else if (part === "tag") {
    document.querySelector(".bit-tag")?.classList.add("highlight");
  }
}

function updateStats() {
  const currentHits = state.hits.toString();
  const currentMisses = state.misses.toString();
  const total = state.hits + state.misses;
  const currentHitRate = (total > 0 ? ((state.hits / total) * 100).toFixed(1) : 0) + "%";

  if (dom.hitCount && dom.hitCount.textContent !== currentHits) {
    dom.hitCount.textContent = currentHits;
    dom.hitCount.classList.add("updated");
    setTimeout(() => dom.hitCount?.classList.remove("updated"), 300);
  }
  if (dom.missCount && dom.missCount.textContent !== currentMisses) {
    dom.missCount.textContent = currentMisses;
    dom.missCount.classList.add("updated");
    setTimeout(() => dom.missCount?.classList.remove("updated"), 300);
  }
  if (dom.hitRate && dom.hitRate.textContent !== currentHitRate) {
    dom.hitRate.textContent = currentHitRate;
    dom.hitRate.classList.add("updated");
    setTimeout(() => dom.hitRate?.classList.remove("updated"), 300);
  }
}

function addLogEntry(message: string, type: "hit" | "miss" | "replace" | "info" = "info") {
  if (!dom.eventLog) return;
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `
    <div class="log-entry-icon">${LOG_ICONS[type]}</div>
    <div class="log-text">
        <div class="log-message">${message}</div>
        <div class="log-timestamp">${new Date().toLocaleTimeString()}</div>
    </div>
  `;
  dom.eventLog.insertBefore(entry, dom.eventLog.firstChild);
  while (dom.eventLog.children.length > 50) {
    dom.eventLog.removeChild(dom.eventLog.lastChild!);
  }

  if (["hit", "miss", "replace"].includes(type)) {
    announceToScreenReader(message, "assertive");
  }
}

async function animateCPUProcessing() {
  renderer?.setCpuProcessing(true);
  await new Promise(resolve => setTimeout(resolve, 600));
  renderer?.setCpuProcessing(false);
}

async function triggerCpuProcessing() {
  renderer?.setCpuProcessing(true);
  await new Promise(resolve => setTimeout(resolve, ANIMATION_SPEED.CPU_PROCESS));
  renderer?.setCpuProcessing(false);
}

async function highlightTargetLines(address: number) {
  if (state.mode === "direct") {
    const index = getIndex(address);
    renderer?.setCacheLineTarget(index);
    await new Promise(resolve => setTimeout(resolve, 1000));
    renderer?.setCacheLineTarget(null);
  } else if (state.mode === "set-associative") {
    const setNum = getSet(address);
    const startIdx = setNum * ASSOCIATIVITY;
    const indices = [];
    for (let i = startIdx; i < startIdx + ASSOCIATIVITY; i++) {
      indices.push(i);
    }
    renderer?.setCacheSetHighlight(indices);
    await new Promise(resolve => setTimeout(resolve, 1000));
    renderer?.setCacheSetHighlight(null);
  }
}

async function animateCacheHit(lineIndex: number, address: number, actionVerb: string) {
  await animateCPUProcessing();
  renderer?.activateWire("wire-cpu-cache-addr", ANIMATION_SPEED.PULSE_TRAVEL);
  await renderer?.animatePulse("pulse-cpu-cache-req", "wire-cpu-cache-addr", ANIMATION_SPEED.PULSE_TRAVEL, "address", false);
  await new Promise(resolve => setTimeout(resolve, ANIMATION_SPEED.STEP_DELAY));

  if (state.mode === "direct" || state.mode === "set-associative") {
    highlightAddressBreakdown(state.mode === "direct" ? "index" : "set");
    await highlightTargetLines(address);
    clearAddressBreakdown();
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  await renderer?.flashCacheLine(lineIndex);
  addLogEntry(`${actionVerb} 0x${address.toString(16).toUpperCase()} -> HIT (Line ${lineIndex})`, "hit");
  await new Promise(resolve => setTimeout(resolve, ANIMATION_SPEED.STEP_DELAY));

  renderer?.activateWire("wire-cpu-cache-data", ANIMATION_SPEED.PULSE_TRAVEL);
  await renderer?.animatePulse("pulse-cache-cpu-data", "wire-cpu-cache-data", ANIMATION_SPEED.PULSE_TRAVEL, "hit-return", true);
}

function highlightMemory(address: number) {
  const blockIndex = Math.floor(address / BLOCK_SIZE);
  const bankIndex = Math.floor(blockIndex / CELLS_PER_BANK) % MEMORY_BANKS;
  const cellIndex = blockIndex % CELLS_PER_BANK;
  renderer?.highlightMemory(bankIndex, cellIndex);
}

function clearMemoryHighlight() {
  renderer?.clearMemoryHighlight();
}

async function animateCacheMiss(lineIndex: number, address: number, tag: number, actionVerb: string, replacedTag: number | null) {
  await animateCPUProcessing();
  renderer?.activateWire("wire-cpu-cache-addr", ANIMATION_SPEED.PULSE_TRAVEL);
  await renderer?.animatePulse("pulse-cpu-cache-req", "wire-cpu-cache-addr", ANIMATION_SPEED.PULSE_TRAVEL, "address", false);
  await new Promise(resolve => setTimeout(resolve, 200));

  if (state.mode === "direct" || state.mode === "set-associative") {
    highlightAddressBreakdown(state.mode === "direct" ? "index" : "set");
    await highlightTargetLines(address);
    clearAddressBreakdown();
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  await renderer?.shakeCacheOnMiss();
  addLogEntry(`${actionVerb} 0x${address.toString(16).toUpperCase()} -> MISS`, "miss");
  await new Promise(resolve => setTimeout(resolve, 200));

  if (replacedTag != null) {
    renderer?.setCacheLineReplacing(lineIndex);
    addLogEntry(`REPLACE Line ${lineIndex} (was 0x${replacedTag.toString(16).toUpperCase()})`, "replace");
    await new Promise(resolve => setTimeout(resolve, 500));
    renderer?.setCacheLineReplacing(null);
  }

  renderer?.activateWire("wire-cache-memory-addr", ANIMATION_SPEED.PULSE_TRAVEL);
  await renderer?.animatePulse("pulse-cache-memory-req", "wire-cache-memory-addr", ANIMATION_SPEED.PULSE_TRAVEL, "address", false);
  await new Promise(resolve => setTimeout(resolve, 200));

  highlightMemory(address);
  await new Promise(resolve => setTimeout(resolve, ANIMATION_SPEED.MEMORY_DELAY));

  renderer?.activateWire("wire-cache-memory-data", ANIMATION_SPEED.PULSE_TRAVEL);
  await renderer?.animatePulse("pulse-memory-cache-data", "wire-cache-memory-data", ANIMATION_SPEED.PULSE_TRAVEL, "miss-return", true);
  await new Promise(resolve => setTimeout(resolve, 200));

  updateCacheLine(lineIndex, tag, `Block@0x${address.toString(16).toUpperCase()}`);
  renderer?.setCacheLineUpdating(lineIndex);
  await renderer?.flashCacheLine(lineIndex);
  addLogEntry(`FETCH 0x${address.toString(16).toUpperCase()} -> Stored in Line ${lineIndex}`, "info");
  await new Promise(resolve => setTimeout(resolve, 500));
  renderer?.setCacheLineUpdating(null);

  clearMemoryHighlight();
  await new Promise(resolve => setTimeout(resolve, 200));
  renderer?.activateWire("wire-cpu-cache-data", ANIMATION_SPEED.PULSE_TRAVEL);
  await renderer?.animatePulse("pulse-cache-cpu-data", "wire-cpu-cache-data", ANIMATION_SPEED.PULSE_TRAVEL, "hit-return", true);
}

async function processMemoryAccess(operation: string, address: number) {
  if (state.isAnimating) {
    addLogEntry("Animation in progress, please wait...", "info");
    return;
  }
  state.isAnimating = true;
  if (dom.executeBtn) dom.executeBtn.disabled = true;
  state.step += 1;
  clearMemoryHighlight();
  updateAddressBreakdown(address);

  await triggerCpuProcessing();
  const tag = getTag(address);
  const lineIndex = searchCache(tag, address);
  const actionVerb = operation === "STORE" ? "WRITE" : "READ";

  if (lineIndex !== -1) {
    state.hits++;
    state.cache[lineIndex].lastAccess = state.step;
    if (operation === "STORE") {
      state.cache[lineIndex].data = `Write@0x${address.toString(16).toUpperCase()}`;
    }
    renderer?.updateCache(state.cache);
    await animateCacheHit(lineIndex, address, actionVerb);
  } else {
    state.misses++;
    const victimLine = findVictimLine(address);
    const replacedTag = state.cache[victimLine].valid ? state.cache[victimLine].tag : null;
    await animateCacheMiss(victimLine, address, tag, actionVerb, replacedTag);
  }

  updateStats();
  state.isAnimating = false;
  if (dom.executeBtn) dom.executeBtn.disabled = false;
}

function executeSingleCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed) return null;
  const regex = /^(LOAD|STORE)\s+R(\d+),\s*0x([0-9A-Fa-f]+)$/i;
  const match = trimmed.match(regex);
  if (!match) return null;

  const operation = match[1].toUpperCase();
  const registerNum = parseInt(match[2], 10);
  const addressHex = match[3];

  if (registerNum < 0 || registerNum > 31) {
    throw new Error(`Invalid register number R${registerNum}. Must be between R0 and R31.`);
  }
  if (addressHex.length < 1 || addressHex.length > 8) {
    throw new Error(`Invalid address 0x${addressHex}. Must be 1-8 hex digits.`);
  }

  const address = parseAddress(addressHex);
  return { operation, address };
}

async function executeCommand(commandText: string) {
  if (!dom.commandInput) return;
  dom.commandInput.classList.remove("error");
  const lines = commandText.trim().split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return;

  if (state.isAnimating) {
    addLogEntry("Animation in progress, please wait...", "info");
    return;
  }

  const commands = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = executeSingleCommand(lines[i]);
      if (!parsed) {
        dom.commandInput.classList.add("error");
        addLogEntry(`❌ Invalid command on line ${i + 1}: "${lines[i]}". Use: LOAD/STORE Rn, 0xADDR`, "info");
        setTimeout(() => dom.commandInput?.classList.remove("error"), 1000);
        return;
      }
      commands.push(parsed);
    } catch (error: any) {
      dom.commandInput.classList.add("error");
      addLogEntry(`❌ Error on line ${i + 1}: ${error.message}`, "info");
      setTimeout(() => dom.commandInput?.classList.remove("error"), 1000);
      return;
    }
  }

  scrollLeftPanelToTop();
  for (let i = 0; i < commands.length; i++) {
    const { operation, address } = commands[i];
    await processMemoryAccess(operation, address).catch(error => {
      addLogEntry(`❌ Runtime error: ${error.message}`, "info");
    });
    if (i < commands.length - 1) await new Promise(resolve => setTimeout(resolve, 300));
  }
}

function showResetModal() {
  if (state.isAnimating) {
    addLogEntry("Cannot reset during animation", "info");
    return;
  }
  if (dom.resetModal) {
    dom.resetModal.style.display = "flex";
    dom.resetModal.dataset.previousFocus = document.activeElement?.id || "";
    setTimeout(() => (document.getElementById("modal-cancel") as HTMLElement)?.focus(), 100);
  }
}

function hideResetModal() {
  if (dom.resetModal) {
    dom.resetModal.style.display = "none";
    const prevId = dom.resetModal.dataset.previousFocus;
    if (prevId) document.getElementById(prevId)?.focus();
  }
}

function resetSimulation() {
  state.hits = 0;
  state.misses = 0;
  state.nextReplacement = 0;
  state.step = 0;
  state.isAnimating = false;

  if (dom.commandInput) dom.commandInput.classList.remove("error");
  initializeCache();
  initializeMemory();
  updateStats();
  if (dom.eventLog) dom.eventLog.innerHTML = "";
  clearMemoryHighlight();
  clearAddressBreakdown();
  hideTooltip();

  if (dom.executeBtn) dom.executeBtn.disabled = false;
  addLogEntry("RESET -> Simulation ready", "info");
  addLogEntry(`MODE -> ${state.mode.replace("-", " ").toUpperCase()}`, "info");
  hideResetModal();
}

function handleModeChange(newMode: string) {
  if (state.isAnimating) {
    addLogEntry("Cannot change mode during animation", "info");
    const radio = document.querySelector(`input[name="cache-mode"][value="${state.mode}"]`) as HTMLInputElement;
    if (radio) radio.checked = true;
    return;
  }

  state.mode = newMode as any;
  renderer?.updateMode(state.mode, ASSOCIATIVITY);
  resetSimulation();
  addLogEntry("MODE CHANGED -> Simulation reset", "info");
  addLogEntry(`MODE -> ${state.mode.replace("-", " ").toUpperCase()}`, "info");
  if (state.mode === "set-associative") {
    addLogEntry(`CONFIG -> ${ASSOCIATIVITY}-Way Set-Associative`, "info");
  }
}

// Tooltip functions
function showTooltip(event: MouseEvent, line: CacheLine) {
  if (!tooltipElement) return;
  tooltipElement.innerHTML = `
    <div><strong>Full Tag:</strong> 0x${line.tag?.toString(16).toUpperCase()}</div>
    <div><strong>Data:</strong> ${line.data}</div>
    <div><strong>Last Accessed:</strong> ${line.lastAccess}</div>
  `;
  tooltipElement.style.display = "block";
  tooltipElement.style.left = `${event.clientX + 16}px`;
  tooltipElement.style.top = `${event.clientY + 16}px`;
}

function hideTooltip() {
  if (tooltipElement) tooltipElement.style.display = "none";
}

// Initializers
document.addEventListener("DOMContentLoaded", () => {
  const checkedRadio = document.querySelector('input[name="cache-mode"]:checked') as HTMLInputElement;
  state.mode = (checkedRadio?.value as any) || "fully-associative";

  // Initialize Canvas renderer
  if (dom.canvas) {
    renderer = new CanvasRenderer(dom.canvas);
    renderer.updateMode(state.mode, ASSOCIATIVITY);
  }

  initializeCache();
  initializeMemory();
  updateStats();
  addLogEntry("INIT -> CacheViz ready", "info");
  addLogEntry(`CONFIG -> ${CACHE_SIZE} lines, ${BLOCK_SIZE}B blocks`, "info");
  addLogEntry(`MODE -> ${state.mode.replace("-", " ").toUpperCase()}`, "info");

  document.querySelectorAll('input[name="cache-mode"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.checked) handleModeChange(target.value);
    });
  });

  dom.executeBtn?.addEventListener("click", () => executeCommand(dom.commandInput.value));
  dom.commandInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      executeCommand(dom.commandInput.value);
    }
  });

  dom.resetBtn?.addEventListener("click", showResetModal);
  dom.modalCancel?.addEventListener("click", hideResetModal);
  dom.modalConfirm?.addEventListener("click", resetSimulation);
  document.querySelector(".modal-overlay")?.addEventListener("click", hideResetModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.resetModal?.style.display === "flex") {
      e.preventDefault();
      hideResetModal();
    }
  });

  document.querySelectorAll(".example-item").forEach(item => {
    const handler = () => {
      const command = (item.getAttribute("data-command") || "").replace(/&#10;/g, "\n");
      if (dom.commandInput) {
        dom.commandInput.value = command;
        executeCommand(command);
      }
    };
    item.addEventListener("click", handler);
    item.addEventListener("keydown", (e: any) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });
  });

  tooltipElement = document.createElement("div");
  tooltipElement.className = "tooltip";
  tooltipElement.style.display = "none";
  document.body.appendChild(tooltipElement);

  // Handle canvas tooltip
  dom.canvas?.addEventListener("mousemove", (e: MouseEvent) => {
    const data = renderer?.getHoveredCacheLineData();
    if (data) {
      showTooltip(e, data.line);
    } else {
      hideTooltip();
    }
  });

  dom.canvas?.addEventListener("mouseleave", () => {
    hideTooltip();
  });
});
