// Cache Configuration
const CACHE_SIZE = 8;
const BLOCK_SIZE = 16;
const MEMORY_BANKS = 4;
const CELLS_PER_BANK = 4;
const ASSOCIATIVITY = 2; // For N-Way Set-Associative mode

// Animation speeds (in milliseconds) - optimized for snappier experience
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

// DOM Cache
const dom = {
  cacheLines: document.getElementById("cache-lines"),
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
  visualization: document.getElementById("visualization") as unknown as SVGSVGElement,
  cpuCore: document.getElementById("cpu-core"),
  cpuCoreLines: document.getElementById("cpu-core-lines"),
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
  renderMemoryCells();
}

// Render memory cell data
function renderMemoryCells() {
  const memoryBankGroups = document.querySelectorAll(".memory-bank-group");
  state.memory.forEach((memBlock, index) => {
    const bankIndex = Math.floor(index / CELLS_PER_BANK);
    const cellIndex = index % CELLS_PER_BANK;
    const bankGroup = memoryBankGroups[bankIndex];
    if (bankGroup) {
      const cell = bankGroup.querySelectorAll(".memory-cell")[cellIndex] as SVGRectElement;
      if (cell) {
        const cellX = parseFloat(cell.getAttribute("x") || "0");

        let textEl = cell.nextElementSibling as SVGTextElement;
        if (!textEl || !textEl.classList.contains("memory-cell-text")) {
          textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
          textEl.classList.add("memory-cell-text");
          textEl.setAttribute("x", (cellX + 25).toString());
          textEl.setAttribute("y", "38");
          cell.parentNode?.insertBefore(textEl, cell.nextSibling);
        }
        if (textEl.textContent !== memBlock.data.substring(0, 6)) {
          textEl.textContent = memBlock.data.substring(0, 6);
        }

        let labelEl = textEl.nextElementSibling as SVGTextElement;
        if (!labelEl || !labelEl.classList.contains("memory-cell-label")) {
          labelEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
          labelEl.classList.add("memory-cell-label");
          labelEl.setAttribute("x", (cellX + 25).toString());
          labelEl.setAttribute("y", "52");
          labelEl.textContent = "(data)";
          cell.parentNode?.insertBefore(labelEl, textEl.nextSibling);
        }
      }
    }
  });
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
  renderCacheLines();
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
  renderCacheLine(lineIndex);
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

function renderSetGrouping() {
  if (!dom.cacheLines) return;
  dom.cacheLines.querySelectorAll(".cache-set-background, .cache-set-divider").forEach((el) => el.remove());

  if (state.mode !== "set-associative") return;

  const numSets = CACHE_SIZE / ASSOCIATIVITY;
  for (let setIdx = 0; setIdx < numSets; setIdx++) {
    const y = setIdx * ASSOCIATIVITY * 56;
    const height = ASSOCIATIVITY * 56 - 4;

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "-8");
    bg.setAttribute("y", y.toString());
    bg.setAttribute("width", "246");
    bg.setAttribute("height", height.toString());
    bg.classList.add("cache-set-background");
    if (setIdx % 2 === 1) bg.classList.add("alternate");
    dom.cacheLines.insertBefore(bg, dom.cacheLines.firstChild);

    if (setIdx < numSets - 1) {
      const divider = document.createElementNS("http://www.w3.org/2000/svg", "line");
      divider.setAttribute("x1", "-8");
      divider.setAttribute("y1", (y + height + 2).toString());
      divider.setAttribute("x2", "238");
      divider.setAttribute("y2", (y + height + 2).toString());
      divider.classList.add("cache-set-divider");
      dom.cacheLines.appendChild(divider);
    }
  }
}

function renderCacheLines() {
  if (!dom.cacheLines) return;
  dom.cacheLines.innerHTML = "";
  renderSetGrouping();
  for (let i = 0; i < CACHE_SIZE; i++) renderCacheLine(i);
}

function renderCacheLine(index: number) {
  if (!dom.cacheLines) return;
  const line = state.cache[index];
  const y = index * 56;
  let group = document.getElementById(`cache-line-${index}`);
  if (!group) {
    group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.id = `cache-line-${index}`;
    group.classList.add("cache-line-group");
    group.dataset.index = index.toString();
    dom.cacheLines.appendChild(group);
  }

  // Optimization: Only update if content changed (simplified for now by re-assigning)
  group.setAttribute("transform", `translate(0, ${y})`);

  const lineStatusClass = line.valid ? "cache-line" : "cache-line empty";
  const tagStr = line.valid ? `0x${line.tag?.toString(16).toUpperCase()}` : "-";
  let displayData = line.valid ? (line.data || "-") : "-";
  if (displayData.length > 18) displayData = displayData.substring(0, 18) + "…";
  const validStr = line.valid ? "V: 1" : "V: 0";
  const validFill = line.valid ? "var(--color-hit)" : "var(--text-secondary)";

  group.innerHTML = `
    <rect x="0" y="0" width="230" height="52" class="${lineStatusClass}" rx="6" ry="6"></rect>
    <text x="10" y="20" class="cache-line-label">L${index}</text>
    <text x="10" y="38" class="cache-line-valid" fill="${validFill}">${validStr}</text>
    <text x="50" y="20" class="cache-line-label">TAG</text>
    <text x="50" y="38" class="cache-line-text">${tagStr}</text>
    <text x="115" y="20" class="cache-line-label">DATA</text>
    <text x="115" y="38" class="cache-line-text" font-size="11">${displayData}</text>
  `;

  group.dataset.tag = tagStr;
  group.dataset.data = line.valid ? (line.data || "—") : "—";
  group.dataset.access = line.lastAccess != null ? line.lastAccess.toString() : "—";

  if (!group.dataset.bound) {
    group.addEventListener("mouseenter", handleCacheLineEnter);
    group.addEventListener("mousemove", handleCacheLineMove);
    group.addEventListener("mouseleave", hideTooltip);
    group.dataset.bound = "true";
  }
  group.classList.toggle("hoverable", line.valid);
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
    dom.eventLog.removeChild(dom.eventLog.lastChild);
  }

  if (["hit", "miss", "replace"].includes(type)) {
    announceToScreenReader(message, "assertive");
  }
}

function animatePulse(pulseId: string, pathId: string, duration: number, variant?: string, reverse = false): Promise<void> {
  return new Promise((resolve) => {
    const pulseGroup = document.getElementById(pulseId)!;
    const head = pulseGroup.querySelector(".pulse-head") as SVGCircleElement;
    const tail = pulseGroup.querySelector(".pulse-tail") as SVGLineElement;
    const path = document.getElementById(pathId) as unknown as SVGPathElement;
    const pathLength = path.getTotalLength();
    pulseGroup.style.display = "block";
    pulseGroup.classList.add("active");
    if (variant) {
      head.classList.add(variant);
      tail.classList.add(variant);
    }
    const startTime = performance.now();
    const tailOffset = 120;

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const headLength = reverse ? pathLength * (1 - eased) : pathLength * eased;
      const tailLength = reverse ? Math.min(headLength + tailOffset, pathLength) : Math.max(headLength - tailOffset, 0);
      const headPoint = path.getPointAtLength(headLength);
      const tailPoint = path.getPointAtLength(tailLength);
      head.setAttribute("cx", headPoint.x.toString());
      head.setAttribute("cy", headPoint.y.toString());
      tail.setAttribute("x1", tailPoint.x.toString());
      tail.setAttribute("y1", tailPoint.y.toString());
      tail.setAttribute("x2", headPoint.x.toString());
      tail.setAttribute("y2", headPoint.y.toString());

      const fadeProgress = reverse ? (1 - progress) : progress;
      tail.style.opacity = Math.max(0.25, 0.85 - 0.45 * fadeProgress).toString();
      head.style.transform = `scale(${1.05 + 0.15 * (1 - progress)})`;
      head.style.opacity = (0.95 + 0.05 * (1 - progress)).toString();

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        pulseGroup.style.display = "none";
        pulseGroup.classList.remove("active");
        if (variant) {
          head.classList.remove(variant);
          tail.classList.remove(variant);
        }
        tail.style.opacity = "";
        head.style.transform = "";
        head.style.opacity = "";
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

async function animateCPUProcessing() {
  if (dom.cpuCore && dom.cpuCoreLines) {
    dom.cpuCore.classList.add("cpu-processing");
    dom.cpuCoreLines.classList.add("cpu-core-processing");
    await new Promise(resolve => setTimeout(resolve, 600));
    dom.cpuCore.classList.remove("cpu-processing");
    dom.cpuCoreLines.classList.remove("cpu-core-processing");
  }
}

function activateWire(wireId: string) {
  const wire = document.getElementById(wireId);
  if (wire) {
    wire.classList.add("active");
    setTimeout(() => wire.classList.remove("active"), ANIMATION_SPEED.PULSE_TRAVEL);
  }
}

async function flashCacheLine(lineIndex: number) {
  const group = document.getElementById(`cache-line-${lineIndex}`);
  const rect = group?.querySelector(".cache-line");
  rect?.classList.add("hit-animation");
  await new Promise(resolve => setTimeout(resolve, ANIMATION_SPEED.CACHE_FLASH));
  rect?.classList.remove("hit-animation");
}

async function shakeCacheOnMiss() {
  const cacheBody = document.querySelector(".cache-body") as SVGRectElement;
  if (cacheBody) {
    cacheBody.style.animation = "missShake 0.4s ease-in-out";
    await new Promise(resolve => setTimeout(resolve, 400));
    cacheBody.style.animation = "";
  }
}

async function triggerCpuProcessing() {
  if (dom.cpuCore && dom.cpuCoreLines) {
    dom.cpuCore.classList.add("processing");
    dom.cpuCoreLines.classList.add("processing");
    await new Promise(resolve => setTimeout(resolve, ANIMATION_SPEED.CPU_PROCESS));
    dom.cpuCore.classList.remove("processing");
    dom.cpuCoreLines.classList.remove("processing");
  }
}

function highlightMemory(address: number) {
  const blockIndex = Math.floor(address / BLOCK_SIZE);
  const bankIndex = Math.floor(blockIndex / CELLS_PER_BANK) % MEMORY_BANKS;
  const cellIndex = blockIndex % CELLS_PER_BANK;
  document.querySelectorAll(".memory-bank-group").forEach((group, idx) => {
    if (idx === bankIndex) {
      group.classList.add("highlight");
      group.querySelectorAll(".memory-cell").forEach((cell, cellIdx) => {
        cell.classList.toggle("highlight", cellIdx === cellIndex);
      });
    } else {
      group.classList.remove("highlight");
      group.querySelectorAll(".memory-cell").forEach((cell) => cell.classList.remove("highlight"));
    }
  });
}

function clearMemoryHighlight() {
  document.querySelectorAll(".memory-bank-group").forEach((group) => {
    group.classList.remove("highlight");
    group.querySelectorAll(".memory-cell").forEach((cell) => cell.classList.remove("highlight"));
  });
}

async function highlightTargetLines(address: number) {
  if (state.mode === "direct") {
    const index = getIndex(address);
    const group = document.getElementById(`cache-line-${index}`);
    const rect = group?.querySelector(".cache-line");
    rect?.classList.add("target-line");
    await new Promise(resolve => setTimeout(resolve, 1000));
    rect?.classList.remove("target-line");
  } else if (state.mode === "set-associative") {
    const setNum = getSet(address);
    const startIdx = setNum * ASSOCIATIVITY;
    for (let i = startIdx; i < startIdx + ASSOCIATIVITY; i++) {
      document.getElementById(`cache-line-${i}`)?.classList.add("in-set-highlight");
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    for (let i = startIdx; i < startIdx + ASSOCIATIVITY; i++) {
      document.getElementById(`cache-line-${i}`)?.classList.remove("in-set-highlight");
    }
  }
}

async function animateCacheHit(lineIndex: number, address: number, actionVerb: string) {
  await animateCPUProcessing();
  activateWire("wire-cpu-cache-addr");
  await animatePulse("pulse-cpu-cache-req", "wire-cpu-cache-addr", ANIMATION_SPEED.PULSE_TRAVEL, "address", false);
  await new Promise(resolve => setTimeout(resolve, ANIMATION_SPEED.STEP_DELAY));

  if (state.mode === "direct" || state.mode === "set-associative") {
    highlightAddressBreakdown(state.mode === "direct" ? "index" : "set");
    await highlightTargetLines(address);
    clearAddressBreakdown();
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  await flashCacheLine(lineIndex);
  addLogEntry(`${actionVerb} 0x${address.toString(16).toUpperCase()} -> HIT (Line ${lineIndex})`, "hit");
  await new Promise(resolve => setTimeout(resolve, ANIMATION_SPEED.STEP_DELAY));

  activateWire("wire-cpu-cache-data");
  await animatePulse("pulse-cache-cpu-data", "wire-cpu-cache-data", ANIMATION_SPEED.PULSE_TRAVEL, "hit-return", true);
}

async function animateCacheMiss(lineIndex: number, address: number, tag: number, actionVerb: string, replacedTag: number | null) {
  await animateCPUProcessing();
  activateWire("wire-cpu-cache-addr");
  await animatePulse("pulse-cpu-cache-req", "wire-cpu-cache-addr", ANIMATION_SPEED.PULSE_TRAVEL, "address", false);
  await new Promise(resolve => setTimeout(resolve, 200));

  if (state.mode === "direct" || state.mode === "set-associative") {
    highlightAddressBreakdown(state.mode === "direct" ? "index" : "set");
    await highlightTargetLines(address);
    clearAddressBreakdown();
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  await shakeCacheOnMiss();
  addLogEntry(`${actionVerb} 0x${address.toString(16).toUpperCase()} -> MISS`, "miss");
  await new Promise(resolve => setTimeout(resolve, 200));

  if (replacedTag != null) {
    const group = document.getElementById(`cache-line-${lineIndex}`);
    const rect = group?.querySelector(".cache-line");
    rect?.classList.add("replacing");
    addLogEntry(`REPLACE Line ${lineIndex} (was 0x${replacedTag.toString(16).toUpperCase()})`, "replace");
    await new Promise(resolve => setTimeout(resolve, 500));
    rect?.classList.remove("replacing");
  }

  activateWire("wire-cache-memory-addr");
  await animatePulse("pulse-cache-memory-req", "wire-cache-memory-addr", ANIMATION_SPEED.PULSE_TRAVEL, "address", false);
  await new Promise(resolve => setTimeout(resolve, 200));

  highlightMemory(address);
  await new Promise(resolve => setTimeout(resolve, ANIMATION_SPEED.MEMORY_DELAY));

  activateWire("wire-cache-memory-data");
  await animatePulse("pulse-memory-cache-data", "wire-cache-memory-data", ANIMATION_SPEED.PULSE_TRAVEL, "miss-return", true);
  await new Promise(resolve => setTimeout(resolve, 200));

  updateCacheLine(lineIndex, tag, `Block@0x${address.toString(16).toUpperCase()}`);
  const group = document.getElementById(`cache-line-${lineIndex}`);
  const rect = group?.querySelector(".cache-line");
  rect?.classList.add("updating");
  await flashCacheLine(lineIndex);
  addLogEntry(`FETCH 0x${address.toString(16).toUpperCase()} -> Stored in Line ${lineIndex}`, "info");
  await new Promise(resolve => setTimeout(resolve, 500));
  rect?.classList.remove("updating");

  clearMemoryHighlight();
  await new Promise(resolve => setTimeout(resolve, 200));
  activateWire("wire-cpu-cache-data");
  await animatePulse("pulse-cache-cpu-data", "wire-cpu-cache-data", ANIMATION_SPEED.PULSE_TRAVEL, "hit-return", true);
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
    renderCacheLine(lineIndex);
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

  document.querySelectorAll(".wire").forEach(w => w.classList.remove("active"));
  document.querySelectorAll(".cache-line").forEach(l => {
    l.classList.remove("hit-animation", "miss-animation", "replacing", "updating", "target-line");
  });

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
  resetSimulation();
  addLogEntry("MODE CHANGED -> Simulation reset", "info");
  addLogEntry(`MODE -> ${state.mode.replace("-", " ").toUpperCase()}`, "info");
  if (state.mode === "set-associative") {
    addLogEntry(`CONFIG -> ${ASSOCIATIVITY}-Way Set-Associative`, "info");
  }
}

// Initializers
document.addEventListener("DOMContentLoaded", () => {
  const checkedRadio = document.querySelector('input[name="cache-mode"]:checked') as HTMLInputElement;
  state.mode = (checkedRadio?.value as any) || "fully-associative";

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
});

function handleCacheLineEnter(event: any) {
  const index = Number(event.currentTarget.dataset.index);
  const line = state.cache[index];
  if (line.valid) showTooltip(event, line);
  else hideTooltip();
}

function handleCacheLineMove(event: any) {
  const index = Number(event.currentTarget.dataset.index);
  const line = state.cache[index];
  if (line.valid) showTooltip(event, line);
  else hideTooltip();
}

function showTooltip(event: any, line: CacheLine) {
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
