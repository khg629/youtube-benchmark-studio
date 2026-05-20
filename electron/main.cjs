const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const APP_NAME = "YouTube Benchmark Studio";
let mainWindow = null;
let nextServer = null;
let serverProcess = null;

function appDir() {
  if (app.isPackaged) return app.getAppPath();
  return path.join(__dirname, "..");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function waitUntilReady(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("앱 서버 시작 시간이 초과되었습니다."));
          return;
        }
        setTimeout(tick, 300);
      });
    };
    tick();
  });
}

async function startNextServer() {
  const port = await freePort();
  const dir = appDir();
  const nodePath = app.isPackaged
    ? path.join(
        process.resourcesPath,
        "desktop-runtime",
        process.platform === "win32" ? "node.exe" : "node",
      )
    : process.env.npm_node_execpath || process.env.NODE || "node";
  const serverScript = path.join(dir, "electron", "server.cjs");
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    YTB_APP_DIR: dir,
    YTB_DATA_DIR: path.join(app.getPath("userData"), "data"),
  };

  serverProcess = spawn(nodePath, [serverScript], {
    cwd: dir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProcess.stdout.on("data", (chunk) => {
    if (!app.isPackaged) process.stdout.write(`[server] ${chunk}`);
  });
  serverProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[server] ${chunk}`);
  });
  serverProcess.once("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Server process exited with code ${code}`);
    }
  });
  await waitUntilReady(port);
  return port;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: "#fafafa",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  try {
    const port = await startNextServer();
    createWindow(port);
  } catch (err) {
    dialog.showErrorBox(APP_NAME, err instanceof Error ? err.message : String(err));
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && process.env.PORT) {
    createWindow(process.env.PORT);
  }
});

app.on("window-all-closed", () => {
  if (nextServer) nextServer.close();
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
