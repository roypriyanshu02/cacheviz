const PORT = 3000;

Deno.serve({
  port: PORT,
  handler: async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    
    try {
      // Serve index.html for root path
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const content = await Deno.readTextFile("./public/index.html");
        return new Response(content, {
          headers: { "Content-Type": "text/html" },
        });
      }
      
      // Serve CSS files
      if (url.pathname === "/styles.css") {
        const content = await Deno.readTextFile("./public/styles.css");
        return new Response(content, {
          headers: { "Content-Type": "text/css" },
        });
      }
      
      // Serve JavaScript files
      if (url.pathname === "/app.js") {
        const content = await Deno.readTextFile("./public/app.js");
        return new Response(content, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
      
      // 404 for other paths
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Error serving file:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  onListen: ({ port }) => {
    console.log(`🚀 RISC Cache-Flow server running at http://localhost:${port}`);
  },
});
