const http = require("node:http");
const next = require("next");

async function main() {
  const port = Number(process.env.PORT || 0);
  const hostname = process.env.HOSTNAME || "127.0.0.1";
  const dir = process.env.YTB_APP_DIR;
  if (!port || !dir) {
    throw new Error("PORT and YTB_APP_DIR are required.");
  }

  const nextApp = next({ dev: false, dir, hostname, port });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, resolve);
  });
  process.stdout.write(`READY ${port}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
