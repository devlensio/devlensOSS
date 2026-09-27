// scripts/capture-reddit.mjs
// Headless Brave CDP-based capture for DevLens Reddit post screenshots
// Usage: node scripts/capture-reddit.mjs
// Depends on Brave at /usr/bin/brave-browser-stable with --headless --remote-debugging-port=9222

import { execSync, spawn } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";

const PORT = 3001; // Frontend port
const CDP_PORT = 9222;
const GRAPH_ID = null; // We'll use the current repo

const OUT_DIR = path.join(__dirname, "../assets/reddit-screen");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Wait for port to be ready
async function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      if (Date.now() - start > timeout) {
        reject(new Error(`Port ${port} not ready after ${timeout}ms`));
        return;
      }
      http.get(`http://localhost:${port}`, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) resolve();
        else setTimeout(check, 500);
      }).on("error", () => setTimeout(check, 500));
    }
    check();
  });
}

// Launch Brave with remote debugging
async function launchBrave() {
  const bravePath = "/usr/bin/brave-browser-stable";
  const hasBrave = fs.existsSync(bravePath);

  let args = [
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${CDP_PORT}`,
    "--headless=new",
    "--disable-gpu",
  ];

  // Kill any existing Brave with CDP on that port
  try {
    execSync(`pkill -f "remote-debugging-port=${CDP_PORT}" 2>/dev/null || true`);
    await new Promise((r) => setTimeout(r, 1000));
  } catch {}

  return new Promise((resolve, reject) => {
    const brave = spawn(bravePath, args, {
      detached: true,
      stdio: "pipe",
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
    });

    brave.stdout.on("data", (d) => {
      if (d.includes("DevTools listening")) resolve();
    });
    brave.stderr.on("data", (d) => {
      // console.error(d.toString());
    });

    // Timeout fallback
    setTimeout(() => resolve(), 3000);
  });
}

// Simple CDP WebSocket client via HTTP (get page, send CDP commands)
async function cdpFetch(pathStr, data) {
  const url = `http://localhost:${CDP_PORT}${pathStr}`;
  const body = data ? JSON.stringify(data) : undefined;
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "localhost",
      port: CDP_PORT,
      path: url,
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body ? Buffer.byteLength(body) : undefined,
      },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve({ text: d }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// Get browser WebSocket endpoint for a page
async function getWebSocketURL() {
  const pages = await cdpFetch("/json/list");
  // Find a non-tab page (devtoolsFrontendUrl should be present)
  const page = pages.find((p) => p.type === "page" && !p.title.includes("chrome://")) || pages[0];
  if (!page || !page.webSocketDebuggerUrl) {
    console.error("No page with WebSocket found:", JSON.stringify(pages, null, 2));
    // Try to open a new page
    const newPage = await cdpFetch("/json/new", { url: "about:blank" });
    process.exit(1);
  }
  return page;
}

// Wait for WS connection and execute CDP commands
async function withBrowserPage(fn) {
  const page = await getWebSocketURL();
  if (!page) {
    console.log("Opening a new blank page...");
    await cdpFetch("/json/new", { url: "http://localhost:" + PORT });
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Use Node's ws or http
  const { WebSocket } = await import("ws");

  // Find a page we can connect to
  const pages = await cdpFetch("/json/list");
  let target = pages.find((p) => p.type === "page");
  if (!target) {
    target = await cdpFetch("/json/new", { url: `http://localhost:${PORT}` });
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (!target.webSocketDebuggerUrl) {
    console.log("No debugger URL, opening page...");
    await cdpFetch("/json/new", { url: `http://localhost:${PORT}` });
    await new Promise((r) => setTimeout(r, 3000));
  }

  const targetPages = await cdpFetch("/json/list");
  const ourPage = targetPages.find(
    (p) => p.type === "page" && p.webSocketDebuggerUrl
  ) || targetPages[0];

  if (!ourPage.webSocketDebuggerUrl) {
    console.error("No WebSocket debugger URL found for any page");
    process.exit(1);
  }

  return fn(ourPage.webSocketDebuggerUrl);
}

async function main() {
  console.log("=== DevLens Reddit Post Screenshot Capture ===\n");

  // Step 1: Verify the UI is up
  try {
    await waitForPort(PORT, 30000);
    console.log(`✓ Frontend at localhost:${PORT} is ready`);
  } catch (e) {
    console.error("✗ Frontend not ready. Run 'bun dev' first.");
    process.exit(1);
  }

  // Step 2: Launch Brave for rendering
  console.log("✓ Launching Brave with CDP...");
  await launchBrave();
  await new Promise((r) => setTimeout(r, 3000));
  console.log("✓ Brave launched");

  // Step 3: Open the graph view
  const graphUrl = `http://localhost:${PORT}/graph`;
  console.log(`\nNavigating to ${graphUrl}...`);

  const screenshotTasks = [
    {
      name: "01_graph_overview",
      url: graphUrl,
      description: "Full graph view showing nodes and edges",
      waitMs: 3000,
      scrollAfter: true,
    },
    {
      name: "02_security_panel",
      url: graphUrl,
      description: "Security panel - severity rankings",
      waitMs: 2000,
    },
    {
      name: "03_filter_panel",
      url: graphUrl,
      description: "Filter/Visible Nodes panel",
      waitMs: 2000,
    },
    {
      name: "04_node_detail",
      url: graphUrl,
      description: "Node detail with technical/business summaries",
      waitMs: 2000,
    },
    {
      name: "05_subgraph",
      url: graphUrl,
      description: "Subgraph view - module cluster",
      waitMs: 2000,
    },
  ];

  for (const task of screenshotTasks) {
    console.log(`\n--- ${task.name}: ${task.description} ---`);

    try {
      const outputPath = path.join(OUT_DIR, `${task.name}.png`);

      // Execute CDP commands in sequence
      const { execSync } = await import("node:child_process");
      const { WebSocket } = await import("ws");

      const { WebSocket: Ws } = await import("ws");

      // Get target page
      const pages = await cdpFetch("/json/list");
      let targetPage = pages.find(p => p.type === "page");
      if (!targetPage) {
        console.log("Opening a page...");
        await cdpFetch("/json/new", { url: task.url });
        await new Promise(r => setTimeout(r, 3000));
      }

      // Re-fetch target pages
      const newPages = await cdpFetch("/json/list");
      targetPage = newPages.find(p => p.type === "page" && p.webSocketDebuggerUrl);
      if (!targetPage) {
        console.log("No target found, trying all...");
        process.exit(1);
      }

      // Wait for page to load
      await new Promise(r => setTimeout(r, task.waitMs));

      // Execute CDP - take screenshot
      // Using the HTTP CDP protocol for screenshot
      const screenshot = await cdpFetch(
        "/devtools/" + ourPage.webSocketDebuggerUrl.split("/").pop() + "/page",
        { method: "screenshot", params: { format: "png" } }
      );
      
      if (screenshot && screenshot.data) {
        fs.writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
        console.log(`  ✓ Saved: ${outputPath}`);
      } else {
        console.log("  ⚠ No screenshot data returned, trying curl...");
        try {
          // Try using Brave's native screenshot method via curl
          execSync(`curl -X POST "http://localhost:${CDP_PORT}/devtools/page/${ourPage.id}/screenshot" -d '{"format":"png"}' > "${outputPath}" 2>/dev/null`, { stdio: "inherit" });
          if (fs.statSync(outputPath).size > 0) {
            console.log(`  ✓ Saved via curl: ${outputPath}`);
          } else {
            console.log("  ✗ Screenshot failed - file empty");
          }
        } catch (e) {
          console.log("  ⚠ curl screenshot failed too");
        }
        // Check if file was created at all
        if (fs.existsSync(outputPath)) {
          const stat = fs.statSync(outputPath);
          if (stat.size > 0) console.log(`  ✓ Saved: ${outputPath} (${stat.size} bytes)`);
        } else console.log("  ✗ Screenshot failed - file doesn't exist");
      }

    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
    }
  }

  console.log("\n=== Done ===");
  console.log(`Screenshots saved to: ${OUT_DIR}`);
}

main().catch(console.error);
