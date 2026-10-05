// One ComputerUseArgs with a single screenshot action, over Connect's
// streaming JSON wire (5-byte envelope: flags, big-endian length), to the
// exec daemon on 1337. Exit 0 when a computerUseResult with a WebP
// ("UklGR" is "RIFF" in base64) comes back.
const body = JSON.stringify({ id: 1, execId: "s", computerUseArgs: { toolCallId: "t", actions: [{ screenshot: {} }] } });
const payload = Buffer.from(body);
const frame = Buffer.alloc(5 + payload.length);
frame.writeUInt32BE(payload.length, 1);
payload.copy(frame, 5);
const response = await fetch("http://127.0.0.1:1337/agent.v1.ExecService/Exec", { method: "POST", headers: { authorization: "Bearer local", "content-type": "application/connect+json" }, body: frame });
const text = Buffer.from(await response.arrayBuffer()).toString("latin1");
process.exit(response.ok && text.includes("computerUseResult") && text.includes("UklGR") ? 0 : 1);
