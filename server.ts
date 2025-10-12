const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    
    // Serve index.html for root path
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const file = Bun.file("./public/index.html");
      return new Response(file, {
        headers: { "Content-Type": "text/html" },
      });
    }
    
    // Serve CSS files
    if (url.pathname === "/styles.css") {
      const file = Bun.file("./public/styles.css");
      return new Response(file, {
        headers: { "Content-Type": "text/css" },
      });
    }
    
    // Serve JavaScript files
    if (url.pathname === "/app.js") {
      const file = Bun.file("./public/app.js");
      return new Response(file, {
        headers: { "Content-Type": "application/javascript" },
      });
    }
    
    // 404 for other paths
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 RISC Cache-Flow server running at http://localhost:${server.port}`);
