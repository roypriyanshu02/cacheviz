const PORT = 3000;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      // Serve index.html for root path
      if (path === "/" || path === "/index.html") {
        return new Response(Bun.file("./dist/index.html"), {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Serve static files from dist directory
      const file = Bun.file(`./dist${path}`);
      if (await file.exists()) {
        return new Response(file);
      }

      // 404 for other paths
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Error serving file:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});

console.log(`🚀 CacheViz server running at http://localhost:${server.port}`);
