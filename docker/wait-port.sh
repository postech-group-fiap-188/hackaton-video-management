#!/bin/sh
set -e

HOST="$1"
PORT="$2"

echo "[prestart] waiting ${HOST}:${PORT}..."

WAIT_HOST="$HOST" WAIT_PORT="$PORT" node -e '
const net = require("net");
const host = process.env.WAIT_HOST;
const port = Number(process.env.WAIT_PORT);

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function loop(){
  while(true){
    const ok = await new Promise((resolve) => {
      const s = net.connect({ host, port }, () => { s.end(); resolve(true); });
      s.setTimeout(800);
      s.on("timeout", () => { s.destroy(); resolve(false); });
      s.on("error", () => resolve(false));
    });
    if(ok) break;
    await sleep(1000);
  }
}
loop().catch(()=>process.exit(1));
'

echo "[prestart] ${HOST}:${PORT} is up"
