import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import cors from "cors";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API route to check for tracking URLs
  app.post("/api/check-urls", async (req, res) => {
    const { pageUrl, trackingUrls } = req.body;
    try {
      const response = await axios.get(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });
      const sourceCode = response.data;
      const foundUrls = (trackingUrls as string[]).filter((url: string) => sourceCode.includes(url));
      res.json({
        present: foundUrls.length > 0,
        foundUrls,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`Axios Error for ${pageUrl}: ${error.message}, Status: ${error.response?.status}`);
        res.status(error.response?.status || 500).json({ error: error.message, statusCode: error.response?.status });
      } else {
        console.error(`Error for ${pageUrl}:`, error);
        res.status(500).json({ error: "Failed to fetch page source", statusCode: 500 });
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
