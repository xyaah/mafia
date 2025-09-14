async function getPastebin(code) {
  return (
    await (await fetch("https://pastebin.com/raw/" + code)).text()
  ).trim();
}

const isDevelopment =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";

const ws = new WebSocket(
  isDevelopment
    ? "ws://localhost:8080"
    : await getPastebin(prompt("Enter game code")),
  [isDevelopment ? "ws" : "wss"]
);

const Role = {
  Townsperson: 0,
  Mafia: 1,
  Doctor: 2,
  Detective: 3,
};

function parseMessage(message) {
  message = message.trim();
  if (!message.includes(" ")) return [message];
  return message.split(" ");
}

let lobbyOthers = [];
let others = [];
let otherMafias = [];
let myRole;

function print(text) {
  story.innerText += "\n> " + text;
}

function isLobbyOwner() {
  const me = lobbyOthers.find((other) => other.me);
  return me && me.isFirstPlayer;
}

function updateLobby() {
  const players = document.querySelector("#lobby #players");
  while (players.children.length > 0) players.removeChild(players.children[0]);

  for (const other of lobbyOthers) {
    const el = document.createElement("li");
    el.innerText =
      other.name +
      (other.isFirstPlayer ? " (lobby owner)" : "") +
      (other.me ? " (you)" : "");
    players.appendChild(el);
  }

  if (!isLobbyOwner()) {
    document.querySelector("#start-game").disabled = true;
  } else {
    document.querySelector("#start-game").disabled = false;
  }
}

const story = document.querySelector("#game-story");
const timer = document.querySelector("#timer");

function gameStarted() {
  others = [...lobbyOthers];
  lobbyOthers = [];
  document.querySelector("#lobby").style.display = "none";
  print(`you enter a strange new land, surrounded by unknown people.`);
  setTimeout(() => print("your identity is revealed.. "), 4000);
}

function roleName(role) {
  if (role === Role.Detective) return "Detective";
  else if (role === Role.Doctor) return "Doctor";
  else if (role === Role.Mafia) return "Mafia";
  else if (role === Role.Townsperson) return "Citizen";
  else return "???";
}

function roleRevealed(role) {
  myRole = role;
  story.innerText += roleName(role);
}

function startTime(at, ms) {
  return new Promise((res) => {
    let interval;
    interval = setInterval(() => {
      const timePassed = Date.now() - at;
      const timeRem = Math.max(0, ms - timePassed) / 1000;
      if (timeRem === 0) {
        clearInterval(interval);
        res();
      } else {
        const min = Math.floor(timeRem / 60);
        const sec = Math.floor(timeRem % 60);
        timer.innerText = `${min.toString().padStart(2, "0")}:${sec
          .toString()
          .padStart(2, "0")}`;
      }
    }, 30);
  });
}

function nightTime() {
  print("night falls over the town. you are immersed in darkness..");
}

/** @returns {Promise<number|undefined>} */
function askSelectPlayer(timeout) {
  return new Promise((res) => {
    let resolved = false;
    /** @type {HTMLUListElement} */
    const selector = document.querySelector("#player-selector");
    while (selector.children.length) selector.removeChild(selector.children[0]);
    function hide() {
      selector.style.display = "none";
    }
    for (const other of others) {
      if (otherMafias.includes(other.id)) continue;
      const el = document.createElement("li");
      const btn = document.createElement("button");
      btn.innerText = other.name;
      btn.addEventListener("click", () => {
        if (!resolved) {
          resolved = true;
          res(other.id);
          hide();
        }
      });
      el.appendChild(btn);
      selector.appendChild(el);
    }
    selector.style.display = "unset";
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        res(undefined);
        hide();
      }
    }, timeout);
  });
}

function showChat(show) {}

function mafiaAskVote() {
  const timeAlloted = 3 * 60 * 1000;
  print("the mafia gathers secretly to decide on someone to kill...");
  showChat(true);
  startTime(Date.now(), timeAlloted).then(() => showChat(false));
  askSelectPlayer(timeAlloted).then((player) => {
    if (player) {
      ws.send(`mafia_vote ${player}`);
    }
  });
}

function onDied(causeOfDeath) {
  switch (causeOfDeath) {
    case "mafia_kill":
      print("the mafia has killed you. this is it for you");
      break;

    case "town_vote":
      print(
        "the town has decided to banish you. this is where your story ends"
      );
      break;

    default:
      break;
  }
}

ws.addEventListener("message", (e) => {
  console.log(e.data);
  const [type, ...args] = parseMessage(e.data);

  switch (type) {
    case "others": {
      lobbyOthers = JSON.parse(args.join(" "));
      updateLobby();
      break;
    }
    case "lobby_new_member": {
      lobbyOthers.push({
        id: Number.parseInt(args[1]),
        name: args.slice(2).join(" "),
        isFirstPlayer: args[1] === "1",
        me: args[0] === "true",
      });
      updateLobby();
      break;
    }
    case "error": {
      alert(args.join(" "));
      break;
    }
    case "started": {
      gameStarted();
      break;
    }
    case "role_reveal": {
      roleRevealed(Number.parseInt(args[0]));
      break;
    }
    case "nighttime": {
      nightTime();
      break;
    }
    case "mafia_ask_vote": {
      mafiaAskVote();
      break;
    }
    case "other_mafias": {
      otherMafias = JSON.parse(args.join(" "));
      break;
    }
    case "died": {
      const causeOfDeath = args[0];
      onDied(causeOfDeath);
      break;
    }
    default:
      break;
  }
});

ws.addEventListener("open", () => {
  const name = prompt("Enter a name to play with:");
  ws.send(`join ${name.trim()}`);
});

document.querySelector("#start-game").addEventListener("click", () => {
  ws.send("start_game");
});
