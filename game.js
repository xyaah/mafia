const isDevelopment =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";

const ws = new WebSocket(
  isDevelopment
    ? "ws://localhost:8787/mafia"
    : "ws://smolgames.xyaah.workers.dev/mafia",
  ["ws"]
);

ws.addEventListener("message", (e) => {
  console.log(e.data);
});

ws.addEventListener("open", () => {
  ws.send("hello from client");
});
