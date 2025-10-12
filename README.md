# RISC Cache-Flow

An interactive, web-based educational tool for visualizing fully associative cache operations.

## Features

- **Real-time Cache Simulation**: Visualize how a fully associative cache handles memory access requests
- **Animated Data Flow**: Watch data pulses travel between CPU, Cache, and Memory
- **Educational Feedback**: Detailed event log showing each step of cache hits and misses
- **Statistics Tracking**: Monitor cache hits, misses, and hit rate
- **Clean, Modern UI**: Flat, Notion-like design optimized for presentations

## Cache Configuration

- **Cache Type**: Fully Associative
- **Cache Lines**: 8
- **Block Size**: 16 bytes
- **Replacement Policy**: Round-robin (FIFO)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime installed

### Installation

1. Navigate to the project directory:
   ```bash
   cd risc-cacheflow
   ```

2. Start the server:
   ```bash
   bun run server.ts
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Usage

### Commands

Execute memory access commands in the format:
```
LOAD Rn, 0xADDRESS
STORE Rn, 0xADDRESS
```

Where:
- `Rn` is a register (e.g., R1, R2, R3, etc.)
- `0xADDRESS` is a hexadecimal memory address

### Example Commands

- `LOAD R1, 0x1A4` - Load data from address 0x1A4
- `STORE R2, 0x2B0` - Store data to address 0x2B0
- `LOAD R3, 0x1A4` - Load from 0x1A4 (should hit if executed after first command)

### Features

1. **Click Example Commands** - Quickly test the cache with pre-defined commands
2. **Watch Animations** - Observe the step-by-step process of cache operations
3. **Monitor Statistics** - Track performance with real-time hit/miss statistics
4. **Review Event Log** - See a detailed chronological history of all operations

## Architecture

### Technology Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript (no frameworks)
- **Server**: Bun
- **Visualization**: Native SVG

### File Structure

```
risc-cacheflow/
├── server.ts           # Bun server
├── public/
│   ├── index.html      # Main HTML structure
│   ├── styles.css      # Flat design styling
│   └── app.js          # Cache simulation logic
└── README.md
```

## Educational Goals

This tool is designed to help students and educators understand:

1. How fully associative caches work
2. The difference between cache hits and misses
3. The process of fetching data from main memory
4. Cache replacement policies
5. Performance implications of cache design

## Design Principles

- **Clarity**: Every animation is deliberate and easy to follow
- **Minimalism**: Flat design with no unnecessary visual complexity
- **Interactivity**: Hands-on learning through direct command execution
- **Feedback**: Immediate visual and textual feedback for every action

## License

MIT License - Feel free to use this for educational purposes.
