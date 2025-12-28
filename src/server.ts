import { gzipSync } from "bun";

const PORT = 3000;

// MIME types
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

// Check if client accepts gzip
function acceptsGzip(req: Request): boolean {
  const acceptEncoding = req.headers.get("accept-encoding") || "";
  return acceptEncoding.includes("gzip");
}

// Get content type from path
function getContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return MIME_TYPES[ext] || "application/octet-stream";
}

// Cache for compressed responses (in-memory for performance)
const compressionCache = new Map<string, Uint8Array>();

try {
  const server = Bun.serve({
    port: PORT,
    reusePort: true,
    async fetch(req) {
      const url = new URL(req.url);
      let path = url.pathname;

      try {
        // Normalize path
        if (path === "/" || path === "/index.html") {
          path = "/index.html";
        }

        const filePath = `./dist${path}`;
        const file = Bun.file(filePath);

        if (!(await file.exists())) {
          return new Response("Not Found", { status: 404 });
        }

        const contentType = getContentType(path);
        const isCompressible = contentType.startsWith("text/") || contentType.includes("javascript");

        // Build response headers
        const headers: Record<string, string> = {
          "Content-Type": contentType,
          // Cache static assets (1 year for CSS/JS, no-cache for HTML)
          "Cache-Control": path === "/index.html"
            ? "no-cache, must-revalidate"
            : "public, max-age=31536000, immutable",
        };

        // Gzip compression for text-based assets
        if (isCompressible && acceptsGzip(req)) {
          let compressed = compressionCache.get(filePath);

          if (!compressed) {
            const content = await file.arrayBuffer();
            compressed = gzipSync(new Uint8Array(content));
            compressionCache.set(filePath, compressed);
          }

          headers["Content-Encoding"] = "gzip";
          headers["Vary"] = "Accept-Encoding";

          return new Response(compressed, { headers });
        }

        return new Response(file, { headers });
      } catch (error) {
        console.error("Error serving file:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  });

  console.log(`🚀 CacheViz server running at http://localhost:${server.port}`);
} catch (error: any) {
  if (error.code === "EADDRINUSE") {
    console.error(`\n❌ Error: Port ${PORT} is already in use.`);
    console.error(`💡 Try running: fuser -k ${PORT}/tcp to free it up, or use a different port.\n`);
  } else {
    console.error("Failed to start server:", error);
  }
  process.exit(1);
}
