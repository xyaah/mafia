const isDevelopment =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";

const ws = new WebSocket(
  isDevelopment
    ? "ws://localhost:8787/"
    : "wss://mafia-matchmaker.xya.workers.dev/",
  [isDevelopment ? "ws" : "wss"]
);

const textContent = {
  "suspense.gameStart":
    "you enter a strange new land, surrounded by unknown people.",
  "suspense.identityReveal": "your identity is revealed.. ",
  "time.night": "night falls over the town. you are immersed in darkness..",
  "activity.mafiaGathering":
    "the mafia gathers secretly to decide on someone to kill...",
  "activity.meeting": "the town holds a meeting to discover the mafias...",
  "time.day": "the sun rises, and another day begins",
  "announcement.allSurvived": "it seems everyone has survived this night",
  "announcement.killed":
    "the town soon discovers that $0 was killed last night by the mafia",
  "killed.mafia": "the mafia has killed you. this is it for you",
  "killed.vote": "the town has banished you. this is where your story ends",
  "activity.banished": "the town has decided to banish $0",
  "activity.banished.fail": "the town couldn't agree on someone to banish",
  "activity.win":
    "you have won this game as a $0. $1 players survived while $2 players died",
  "activity.loss":
    "you have lost this game as a $0. $1 players survived while $2 players died",
  "activity.detective":
    "as a detective, you have the power to choose one person and you will see their role",
  "activity.detective.result": "you found out that $0 is a $1.",
};

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

let detectiveChoice;

/** @param {HTMLElement} el  */
function removeChildren(el, type) {
  if (!type) while (el.children.length > 0) el.removeChild(el.children[0]);
  else {
    const childrenOfType = () =>
      [...el.children].filter(
        (child) => child.tagName.toLowerCase() === type.toLowerCase()
      );
    while (childrenOfType().length > 0) el.removeChild(childrenOfType()[0]);
  }
}

function print(textId, ...args) {
  /** @type {string} */
  let string = textContent[textId] ?? textId;
  for (let i = 0; i < args.length; i++) {
    string = string.replaceAll("$" + i, args[i]);
  }
  story.innerText += "\n> " + string;
  story.scrollTop = story.scrollHeight - story.clientHeight;
}

function getMe() {
  return [...lobbyOthers, ...others].find((x) => x.me);
}

function isLobbyOwner() {
  const me = lobbyOthers.find((other) => other.me);
  return me && me.isLobbyOwner;
}

function updateLobby() {
  const players = document.querySelector("#lobby #players");
  removeChildren(players);

  for (const other of lobbyOthers) {
    const el = document.createElement("li");
    el.innerText =
      other.name +
      (other.isLobbyOwner ? " (lobby owner)" : "") +
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
  document.querySelector("#game-container").style.display = "unset";
  print("suspense.gameStart");
  setTimeout(() => print("suspense.identityReveal"), 4000);
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
  let doCancel = () => {};
  return {
    promise: new Promise((res) => {
      timer.style.display = "unset";
      let interval;
      function stop() {
        timer.style.display = "none";
        timer.innerText = "";
        clearInterval(interval);
        res();
      }
      doCancel = stop;
      interval = setInterval(() => {
        const timePassed = Date.now() - at;
        const timeRem = Math.max(0, ms - timePassed) / 1000;
        if (timeRem === 0) stop();
        else {
          const min = Math.floor(timeRem / 60);
          const sec = Math.floor(timeRem % 60);
          timer.innerText = `${min.toString().padStart(2, "0")}:${sec
            .toString()
            .padStart(2, "0")}`;
        }
      }, 30);
    }),
    cancel: () => doCancel(),
  };
}

function nightTime() {
  print("time.night");
}

/** @returns {Promise<number|undefined>} */
function askSelectPlayer(timeout, showOtherMafias, label) {
  return new Promise((res) => {
    let resolved = false;
    document.querySelector("#player-selector-label").innerText = label;
    /** @type {HTMLUListElement} */
    const selector = document.querySelector("#player-selector");
    removeChildren(selector, "li");
    document.body.classList.add("player-selector-open");
    function hide() {
      document.body.classList.remove("player-selector-open");
      selector.style.display = "none";
    }
    for (const other of others) {
      if (otherMafias.includes(other.id) && !showOtherMafias) continue;
      if (other.me) continue;
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

const chatContainer = document.querySelector("#chat-container");
const chatMessage = document.querySelector("#chat-message");
let isCurChatMafia;

chatMessage.addEventListener("keyup", (e) => {
  if (e.code === "Enter") {
    const content = chatMessage.value;
    ws.send(
      `${isCurChatMafia ? "mafia_chat_send" : "town_chat_send"} ${content}`
    );
    chatMessage.value = "";
  }
});

function onChatMessage(from, content) {
  const sender = others.find((other) => other.id === from);
  print(`${sender.name}: ${content}`);
}

function showChat(isMafiaChat, show) {
  console.log(`show ${isMafiaChat ? "mafia" : "town"} chat: ${show}`);
  isCurChatMafia = isMafiaChat;
  chatContainer.style.display = show ? "unset" : "none";
  const myName = getMe().name;
  document.querySelector(
    'label[for="chat-message"]'
  ).innerText = `${myName} -> ${isMafiaChat ? "mafia" : "town"}: `;
}

function mafiaAskVote() {
  const timeAlloted = 3 * 60 * 1000;
  print("activity.mafiaGathering");
  const time = startTime(Date.now(), timeAlloted);
  time.promise.then(() => showChat(true, false));
  askSelectPlayer(timeAlloted, false, "Choose who you want to kill").then(
    (player) => {
      time.cancel();
      if (player) {
        ws.send(`mafia_vote ${player}`);
      }
    }
  );
}
function discussionTime() {
  const timeAlloted = 3 * 60 * 1000;
  print("activity.meeting");
  const time = startTime(Date.now(), timeAlloted);
  time.promise.then(() => showChat(false, false));
  askSelectPlayer(timeAlloted, true, "Choose who you think is the mafia").then(
    (player) => {
      time.cancel();
      if (player) {
        ws.send(`day_kick_vote ${player}`);
      }
    }
  );
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function dayTime(mafiaKilled) {
  print("time.day");
  sleep(1500).then(() => {
    mafiaKilled == null
      ? print("announcement.allSurvived")
      : print(
          "announcement.killed",
          others.find((other) => other.id === mafiaKilled).name
        );
    removePlayer(mafiaKilled);
  });
}

function onDied(causeOfDeath) {
  switch (causeOfDeath) {
    case "mafia_kill":
      print("killed.mafia");
      break;

    case "town_vote":
      print("killed.vote");
      break;

    default:
      break;
  }
}

function dayVoteResult(result) {
  const voted =
    result == null ? null : others.find((other) => other.id === result);
  if (voted === null) print("activity.banished.fail");
  else if (!voted.me) print("activity.banished", voted.name);
  if (voted) removePlayer(voted.id);
}

function removePlayer(id) {
  others.splice(
    others.findIndex((other) => other.id === id),
    1
  );
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
        isLobbyOwner: args[1] === "1",
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
    case "mafia_chat_status":
    case "town_chat_status": {
      showChat(type === "mafia_chat_status", args[0] === "true");
      break;
    }
    case "town_chat":
    case "mafia_chat": {
      onChatMessage(Number.parseInt(args[0]), args.slice(1).join(" "));
      break;
    }
    case "discussion_time": {
      discussionTime();
      break;
    }
    case "daytime": {
      const mafiaKilled = args[0] === "null" ? null : Number.parseInt(args[0]);
      dayTime(mafiaKilled);
      break;
    }
    case "day_vote_result": {
      const result = args[0] === "null" ? null : Number.parseInt(args[0]);
      dayVoteResult(result);
      break;
    }
    case "win":
      print(
        "activity.win",
        roleName(Number.parseInt(args[0])),
        args[1],
        args[2]
      );
      break;
    case "loss":
      print(
        "activity.loss",
        roleName(Number.parseInt(args[0])),
        args[1],
        args[2]
      );
      break;
    case "detective_turn":
      print("activity.detective");
      askSelectPlayer(
        3 * 60 * 1000,
        false,
        "Select a person to see their role."
      ).then((value) => {
        detectiveChoice = value;
        if (value) ws.send(`detective_peek ${value}`);
      });
      break;
    case "detective_result":
      if (detectiveChoice) {
        print(
          "activity.detective.result",
          others.find((other) => other.id === detectiveChoice).name,
          roleName(Number.parseInt(args[0]))
        );
      }
      break;
    default:
      break;
  }
});

ws.addEventListener("open", () => {
  const name = prompt("Enter a name to play with:");
  document.querySelector('label[for="chat-message"]').innerText = name + ":";
  ws.send(`join ${name.trim()}`);
});

document.querySelector("#start-game").addEventListener("click", () => {
  ws.send("start_game");
});
