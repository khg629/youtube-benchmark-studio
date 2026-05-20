const { app, BrowserWindow, dialog, shell } = require("electron");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const APP_NAME = "YouTube Benchmark Studio";
let mainWindow = null;
let nextServer = null;

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
  process.env.PORT = String(port);
  process.env.HOSTNAME = "127.0.0.1";
  process.env.YTB_DATA_DIR = path.join(app.getPath("userData"), "data");

  const next = require("next");
  const nextApp = next({ dev: !app.isPackaged, dir, hostname: "127.0.0.1", port });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();
  nextServer = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve, reject) => {
    nextServer.once("error", reject);
    nextServer.listen(port, "127.0.0.1", resolve);
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
  if (process.platform !== "darwin") app.quit();
});
