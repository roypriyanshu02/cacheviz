# CacheViz 🧠

CacheViz is an interactive teaching tool for breaking down cache memory mapping functions. Built to turn tough computer architecture slides into animations classmates can actually follow. The goal is simple: demystify how Direct Mapped, N-Way Set-Associative, and Fully Associative caches juggle hits, misses, and replacements through approachable visuals.

[**Live Demo on GitHub Pages**](https://roypriyanshu02.github.io/cacheviz/)

## ✨ Features

- Visualize 3 Core Cache Mapping Functions: **Direct Mapped, N-Way Set-Associative,** and **Fully Associative.**
- Interactive, step-by-step animations for cache **hits, misses, and replacements.**
- A simple **RISC instruction set** with multi-line support.
- Real-time **statistics** and a clear **event log** to track the simulation.

## 🛠️ Tech Stack

- Vanilla TypeScript, HTML5, and CSS3
- Deno for the local development environment

## 🚀 Getting Started

1. Clone the repository: `git clone https://github.com/roypriyanshu02/cacheviz.git`
2. Navigate into the project directory: `cd cacheviz`
3. Run the development server: `deno task dev`
4. Open your browser to `http://localhost:3000`

## How to Use

- Use the radio buttons on the left to switch between cache mapping modes.
- Type your own commands into the textarea, or click one of the pre-made examples to get started.
- Click "Execute" and watch the magic happen in the diagram!