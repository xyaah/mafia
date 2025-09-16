//@ts-check

const isDevelopment = location.hostname !== "xyaah.github.io";

const ws = new WebSocket(
  isDevelopment
    ? `${location.protocol}//${location.hostname}:8787/`
    : "wss://mafia-matchmaker.xya.workers.dev/",
  [isDevelopment ? "ws" : "wss"]
);

/**
 * @template {HTMLElement} T
 * @param {string} selector
 * @returns {T}
 */
function $(selector) {
  // @ts-ignore
  return document.querySelector(selector);
}

/** @param {number} ms */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** @type {HTMLPreElement} */
const story = $("#game-story");
/** @type {HTMLSpanElement} */
const timer = $("#timer");
const chatContainer = $("#chat-container");
/** @type {HTMLInputElement} */
const chatMessage = $("#chat-message");

const textContent = {
  "suspense.gameStart":
    "you enter a strange new land, surrounded by unknown people.",
  "suspense.identityReveal": "your identity is revealed.. ",
  "time.night": "night falls over the town. you are immersed in darkness..",
  "activity.mafiaGathering":
    "the mafia gathers secretly to decide on someone to kill...",
  "activity.mafiaGathering.result": "the mafia decided to kill $0",
  "activity.mafiaGathering.result.fail": "the mafia couldn't agree who to kill",
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
  disconnected: "$0 has left the game.",
};

/** @enum {number} */
const Role = {
  Townsperson: 0,
  Mafia: 1,
  Doctor: 2,
  Detective: 3,
};

/**
 * @param {number} id
 */
function removePlayer(id) {
  others.splice(
    others.findIndex((other) => other.id === id),
    1
  );
}

/**
 * @param {string} message
 * @returns {string[]}
 */
function parseMessage(message) {
  message = message.trim();
  if (!message.includes(" ")) return [message];
  return message.split(" ");
}

/**
 * @param {HTMLElement} el
 * @param {string?} type
 */
function removeChildren(el, type = null) {
  if (!type) while (el.children.length > 0) el.removeChild(el.children[0]);
  else {
    const childrenOfType = () =>
      [...el.children].filter(
        (child) => child.tagName.toLowerCase() === type.toLowerCase()
      );
    while (childrenOfType().length > 0) el.removeChild(childrenOfType()[0]);
  }
}

/**
 * @param {string} textId
 * @param {...any} args
 */
function print(textId, ...args) {
  /** @type {string} */
  let string = textContent[textId] ?? textId;
  for (let i = 0; i < args.length; i++) {
    string = string.replaceAll("$" + i, args[i]);
  }
  story.textContent += "\n> " + string;
  story.scrollTop = story.scrollHeight - story.clientHeight;
}

/**
 * @returns {Other}
 */
function getMe() {
  const me = [...lobbyOthers, ...others].find((x) => x.me);
  if (!me) throw "Cannot find self in lobbyOthers & others";
  return me;
}

function isLobbyOwner() {
  const me = lobbyOthers.find((other) => other.me);
  return me && me.isLobbyOwner;
}

/**
 * @param {number} role
 */
function roleName(role) {
  if (role === Role.Detective) return "Detective";
  else if (role === Role.Doctor) return "Doctor";
  else if (role === Role.Mafia) return "Mafia";
  else if (role === Role.Townsperson) return "Citizen";
  else return "???";
}

/**
 * @type {{
 *    promise: Promise<void>;
 *    cancel: () => void;
 * }|undefined}
 */
let _curTimer;
/**
 * @param {number} at
 * @param {number} ms
 */
function startTime(at, ms) {
  let doCancel = () => {};
  if (_curTimer) _curTimer.cancel();
  const timerObj = {
    promise: /** @type {Promise<void>} */ (
      new Promise((res) => {
        timer.style.display = "unset";
        let interval;
        function stop() {
          timer.style.display = "none";
          timer.textContent = "";
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
            timer.textContent = `${min.toString().padStart(2, "0")}:${sec
              .toString()
              .padStart(2, "0")}`;
          }
        }, 30);
      })
    ),
    cancel: () => doCancel(),
  };
  _curTimer = timerObj;
  return timerObj;
}

/**
 * @returns {Promise<number | undefined>}
 * @param {number | undefined} timeout
 * @param {boolean} showOtherMafias
 * @param {string | null} label
 */
function askSelectPlayer(timeout, showOtherMafias, label) {
  return new Promise((res) => {
    let resolved = false;
    $("#player-selector-label").textContent = label;
    /** @type {HTMLUListElement} */
    const selector = $("#player-selector");
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
      btn.textContent = other.name;
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

/**
 * @param {Other[]} players
 * @param {number} id
 * @returns {Other}
 */
function getPlayerById(players, id) {
  const player = players.find((player) => player.id === id);
  if (!player) throw "Player not found: " + id;
  return player;
}

/**
 * @typedef {{
 *  id: number;
 *  name: string;
 *  me: boolean;
 *  isLobbyOwner: boolean;
 * }} Other
 */

/** @type {Other[]} */
let lobbyOthers = [];
/** @type {Other[]} */
let others = [];
/** @type {number[]} */
let otherMafias = [];
let myRole;

let detectiveChoice;
let isCurChatMafia;

function updateLobby() {
  /** @type {HTMLUListElement} */
  const players = $("#lobby #players");
  /** @type {HTMLButtonElement} */
  const startGame = $("#start-game");
  removeChildren(players);

  for (const other of lobbyOthers) {
    const el = document.createElement("li");
    el.textContent =
      other.name +
      (other.isLobbyOwner ? " (lobby owner)" : "") +
      (other.me ? " (you)" : "");
    players.appendChild(el);
  }

  if (!isLobbyOwner()) {
    startGame.disabled = true;
  } else {
    startGame.disabled = false;
  }
}

function gameStarted() {
  others = [...lobbyOthers];
  lobbyOthers = [];
  $("#game-container").style.display = "unset";
  $("#lobby").style.display = "none";
  print("suspense.gameStart");
  setTimeout(() => print("suspense.identityReveal"), 4000);
}

/**
 * @param {number} role
 */
function roleRevealed(role) {
  myRole = role;
  story.textContent += roleName(role);
}

function nightTime() {
  if (_curTimer) _curTimer.cancel();
  print("time.night");
}

chatMessage.addEventListener("keyup", (e) => {
  if (e.code === "Enter" || e.keyCode === 13) {
    const content = chatMessage.value;
    ws.send(
      `${isCurChatMafia ? "mafia_chat_send" : "town_chat_send"} ${content}`
    );
    chatMessage.value = "";
  }
});

/**
 * @param {number} from
 * @param {string} content
 */
function onChatMessage(from, content) {
  const sender = getPlayerById(others, from);
  story.textContent += `\n${sender.name}: ${content}`;
  story.scrollTop = story.scrollHeight - story.clientHeight;
}

/**
 * @param {boolean} isMafiaChat
 * @param {boolean} show
 */
function showChat(isMafiaChat, show) {
  console.log(`show ${isMafiaChat ? "mafia" : "town"} chat: ${show}`);
  isCurChatMafia = isMafiaChat;
  chatContainer.style.display = show ? "unset" : "none";
  const myName = getMe().name;
  $('label[for="chat-message"]').textContent = `${myName} -> ${
    isMafiaChat ? "mafia" : "town"
  }: `;
}

function mafiaAskVote() {
  const timeAlloted = 3 * 60 * 1000;
  print("activity.mafiaGathering");
  const time = startTime(Date.now(), timeAlloted);
  time.promise.then(() => showChat(true, false));
  askSelectPlayer(timeAlloted, false, "Choose who you want to kill").then(
    (player) => {
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
      if (player) {
        ws.send(`day_kick_vote ${player}`);
      }
    }
  );
}

/**
 * @param {number | null} mafiaKilled
 */
function dayTime(mafiaKilled) {
  print("time.day");
  if (_curTimer) _curTimer.cancel();
  sleep(1500).then(() => {
    mafiaKilled == null
      ? print("announcement.allSurvived")
      : print("announcement.killed", getPlayerById(others, mafiaKilled).name);
    if (mafiaKilled) removePlayer(mafiaKilled);
  });
}

/**
 * @param {string} causeOfDeath
 */
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

/**
 * @param {number | null} result
 */
function dayVoteResult(result) {
  const voted =
    result == null ? null : others.find((other) => other.id === result);
  if (voted == null) print("activity.banished.fail");
  else if (!voted.me) print("activity.banished", voted.name);
  if (voted) removePlayer(voted.id);
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
          getPlayerById(others, detectiveChoice).name,
          roleName(Number.parseInt(args[0]))
        );
      }
      break;
    case "lobby_disconnect":
      lobbyOthers.splice(
        lobbyOthers.findIndex((other) => other.id === Number.parseInt(args[0])),
        1
      );
      updateLobby();
      break;
    case "repick_username":
      setName(prompt("Enter another name:") ?? "");
      break;
    case "mafia_vote_result":
      const failed = args[0] === "null";
      print(
        failed
          ? "activity.mafiaGathering.result.fail"
          : "activity.mafiaGathering.result",
        failed
          ? undefined
          : getPlayerById(others, Number.parseInt(args[0])).name
      );
      break;
    case "disconnected":
      const id = Number.parseInt(args[0]);
      print("disconnected", getPlayerById(others, id).name);
      removePlayer(id);
    default:
      break;
  }
});

/**
 * @param {string} name
 */
function setName(name) {
  $('label[for="chat-message"]').textContent = name + ":";
  ws.send(`join ${name.trim()}`);
}

ws.addEventListener("open", () => {
  let name;
  while (!name) name = prompt("Enter a name to play with:");
  setName(name);
});

$("#start-game").addEventListener("click", () => {
  ws.send("start_game");
});
