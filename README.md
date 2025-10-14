# RISC Cache-Flow

An interactive web-based visualizer for comparing cache mapping functions: Direct Mapped, N-Way Set-Associative, and Fully Associative.

## Key Features
- **Three Cache Mapping Modes**:
  - Direct Mapped: Each memory block maps to exactly one cache line
  - N-Way Set-Associative: Memory blocks map to a specific set of cache lines (configurable, default 2-Way)
  - Fully Associative: Any memory block can be stored in any cache line
- **Address Breakdown Visualization**: Dynamic display showing TAG, INDEX/SET, and OFFSET bits for Direct and Set-Associative modes
- **Mode-Specific Animations**:
  - Index/Set highlighting shows which cache line(s) to check
  - Visual grouping of sets in Set-Associative mode
  - Targeted animations demonstrate search paths
- Interactive Animation of Cache Hits & Misses
- Multi-line Command Input
- Curated Examples for Teaching
- Real-time Statistics Tracking

## Tech Stack
Built with vanilla HTML, CSS, and JavaScript. Served by Deno.

## How to Run
1. Ensure Deno is installed (https://deno.land/).
2. Run `deno task dev` to start the development server with hot-reloading, or `deno task start` for production.
3. Open `http://localhost:3000` in your browser.

## Usage
1. Select a cache mapping mode from the left panel (Direct Mapped, N-Way Set-Associative, or Fully Associative)
2. Enter LOAD/STORE commands in the format: `LOAD R1, 0x1A4`
3. Watch the animations demonstrate cache behavior
4. Observe the address breakdown (for Direct and Set-Associative modes) showing how the address is divided into components
5. Track statistics: hits, misses, and hit rate
