#!/usr/bin/env node
// Saves an effect sheet from the running website's effects gallery as a PNG.
// It starts headless Chrome, opens `#effects`, and calls the page's
// `renderEffectSheet`, which steps a fixed clock, so a sheet is the same every run.
//
//   node capture.mjs --faction cyber-samurai --effect laser --subject tank
//
// --effect is a kind of shot, such as bullet or laser, or `death`, which plays
// the death its subject's size calls for. Options: --url (default http://localhost:5190), --out (default
// art/staging/renders/effects/<faction>/<effect>-<subject>.png, from the working
// directory). Set CHROME to the browser's path where it is not the macOS default.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    faction: { type: "string" },
    effect: { type: "string" },
    subject: { type: "string", default: "soldier" },
    url: { type: "string", default: "http://localhost:5190" },
    out: { type: "string" },
  },
});
if (values.faction === undefined || values.effect === undefined) {
  console.error(
    "Usage: capture.mjs --faction <id> --effect <name> [--subject soldier|tank|war-factory]",
  );
  process.exit(2);
}
const settings = {
  faction: values.faction,
  effect: values.effect,
  subject: values.subject,
  kind: values.effect === "death" ? "death" : "shot",
  speed: 1,
};
const out =
  values.out ??
  join(
    "art/staging/renders/effects",
    settings.faction,
    `${settings.effect}-${settings.subject}.png`,
  );
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const profile = await mkdtemp(join(tmpdir(), "effect-sheet-"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--enable-unsafe-swiftshader",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

try {
  const endpoint = await new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not start")), 15000);
    browser.stderr.on("data", (chunk) => {
      text += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(text);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    browser.on("error", reject);
  });

  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error(`Could not reach Chrome at ${endpoint}`));
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const waiting = pending.get(message.id);
    if (waiting === undefined) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const evaluate = async (sessionId, expression, awaitPromise = false) => {
    const { result, exceptionDetails } = await send(
      "Runtime.evaluate",
      { expression, awaitPromise, returnByValue: true },
      sessionId,
    );
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value;
  };

  const { targetId } = await send("Target.createTarget", { url: `${values.url}/#effects` });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const ready = Date.now() + 30000;
  while (!(await evaluate(sessionId, "typeof window.renderEffectSheet === 'function'"))) {
    if (Date.now() > ready) throw new Error(`The gallery did not load from ${values.url}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const sheet = await evaluate(
    sessionId,
    `window.renderEffectSheet(${JSON.stringify(settings)})`,
    true,
  );
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(sheet.png.split(",")[1], "base64"));
  console.log(
    JSON.stringify({
      sheet: out,
      ...settings,
      peakParticles: sheet.peakParticles,
      peakDrawCalls: sheet.peakDrawCalls,
      peakTriangles: sheet.peakTriangles,
    }),
  );
  socket.close();
} finally {
  const exited = new Promise((resolve) => browser.once("exit", resolve));
  browser.kill();
  await exited;
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
