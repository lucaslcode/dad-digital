const files = [
  "assets/0night.mp4",
  "assets/1construction.mp4",
  "assets/2busyroad.mp4",
  "assets/3kidsoutside.mp4",
  "assets/4inmrt.mp4",
  "assets/5nightroad.mp4",
  "assets/6piano.mp4",
  "assets/7forest.mp4",
];

const specialTrackIndex = 6;
const specialTrackModifierPercent = 0.5;
const pingInterval = 2; //seconds
const volumeInterval = 0.25; //seconds
const textInterval = 1; //seconds
const pieceId = 1;
const minPrevMax = 20;
const numTracks = files.length;
const textContainer = document.getElementById("text-container");

let client;
let players;
let playButton;
let override = false;
let totalTime = 0;
let textIndex = -1;

let rawListenData; //response from backend
let listenData; //{secs: number, value: number}[], count normalized 0-1 based on prev_max
let listenDataIndex = 0;

window.addEventListener("load", function () {
  playButton = document.getElementById("play-button");
  if (new URLSearchParams(window.location.search).has("override")) {
    this.document
      .getElementById("override-slider-container")
      .classList.remove("hidden");
  }
  if (
    !window.hasOwnProperty("AudioContext") &&
    !window.hasOwnProperty("webkitAudioContext")
  )
    handleError(Error(), "Sorry, this browser is too old...");
  else init();
});

async function init() {
  client = window.supabase.createClient(
    "https://gbpmhxxqzickphlaeahr.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzODg4Njc4MiwiZXhwIjoxOTU0NDYyNzgyfQ.NWerKi-e0T9awTFjXTvUYmR6fv2FgHtPpj4O1zPnbuU"
  );

  //init starts new counts if necessary
  const { error: initError } = await client.rpc("init", {
    _piece_id: pieceId,
  });
  if (initError) {
    handleError(initError);
    throw initError;
  }

  //returns {prev_max: int, last_reset: iso time string, counts?: {secs: number, count: number}[]}
  const { data: rawListenData, error: listenDataError } = await client.rpc(
    "listen_data",
    {
      _piece_id: pieceId,
    }
  );
  if (listenDataError) {
    handleError(listenDataError);
    throw listenDataError;
  }

  console.debug("Backend raw data: ", rawListenData);

  const timeAgo = getTimeAgo(new Date(rawListenData.last_reset + "+00:00")); //so bad...

  document.getElementById("last-rebuild").innerHTML =
    "I was last rebuilt " + timeAgo + ".";

  document.getElementById("title").classList.add("start");
  setTimeout(() => {
    document.getElementById("title").classList.add("hidden");
    document.getElementById("intro-texts").classList.add("start");
    document.getElementById("intro-texts").classList.remove("hidden");
  }, 2000);

  //normalize listen data
  //this also applies a minimum
  if (rawListenData.counts) {
    listenData = rawListenData.counts.map((data) => ({
      secs: data.secs,
      value: Math.min(
        data.count / Math.max(rawListenData.prev_max, minPrevMax),
        1
      ),
    }));
  }

  const visitedTimes = window.localStorage.getItem("visited") || "0";
  const numVisitedTimes = Number.parseInt(visitedTimes);
  if (numVisitedTimes > 0) playButton.classList.add("ensure-visible");

  //support ?override=0.3 etc.
  const searchParams = new URLSearchParams(window.location.search);
  const rawOverride = searchParams.get("override");
  override = Number.parseFloat(rawOverride);
  if (!isNaN(override)) {
    listenData = new Array(99999)
      .fill(override)
      .map((val, index) => ({ secs: index, value: override }));
  } else {
    if (searchParams.has("override")) override = true;
    else override = false;
  }
  if (numVisitedTimes > 9 && !override) {
    this.document.getElementById("cheat-link").classList.remove("hidden");
  }

  if (!listenData) {
    listenData = [{ secs: 0, value: 0 }];
  }

  //load music
  await new Promise(function (resolve) {
    players = new Tone.Players(
      Object.fromEntries(files.map((url, index) => [index, url])),
      { onload: resolve, onerror: handleError, onstop: console.error }
    );
  });

  files.forEach((_, index) => {
    const runtime =
      players.player(index).buffer.length /
      players.player(index).buffer.sampleRate;
    totalTime = Math.max(totalTime, runtime);
  });
  console.debug("Total time: ", totalTime);

  //add a second with a 0 value in case the count is suddenly 0 (which would have no data)
  const highestSecs = listenData[listenData.length - 1].secs;
  if (highestSecs < totalTime - 5) {
    listenData.push({
      secs: listenData[listenData.length - 1].secs + 1,
      value: 0,
    });
  }

  playButton.addEventListener("click", onPlayClick);
  playButton.disabled = false;
}

async function onPlayClick() {
  await Tone.start();

  const currentValue = interpolateTime(0);
  const volumes = trackModifiers(currentValue, numTracks, specialTrackIndex);
  new Array(numTracks).fill(0).forEach((_, index) => {
    players.player(index).toDestination().sync().start(0);
    if (volumes[index] === null) players.player(index).mute = true;
    else {
      players.player(index).volume.value = volumes[index];
      players.player(index).mute = false;
    }
  });
  if (override === false) {
    //can be 0
    const pingLoop = new Tone.Loop(async function (time) {
      const roundedTime = Math.floor(time);
      console.debug("Sending ping:", roundedTime);
      let { error } = await client.rpc("listen", {
        _piece_id: pieceId,
        _secs: roundedTime,
      });
      if (error) {
        handleError(error);
        throw error;
      }
    }, pingInterval).start(0);
  }

  const volumeIntervalHandle = setInterval(function () {
    let currentValue;
    if (override === false)
      currentValue = interpolateTime(Tone.Transport.seconds);
    else currentValue = document.getElementById("override-slider").value;
    const volumes = trackModifiers(currentValue, numTracks, specialTrackIndex);
    console.debug("Current value: ", currentValue, "Volumes: ", volumes);
    volumes.forEach((volume, index) => {
      if (volume === null) players.player(index).mute = true;
      else {
        players.player(index).volume.value = volume;
        players.player(index).mute = false;
      }
    });
  }, volumeInterval * 1000);

  const textIntervalHandle = setInterval(function () {
    let currentValue;
    if (override === false)
      currentValue = interpolateTime(Tone.Transport.seconds);
    else currentValue = document.getElementById("override-slider").value;

    const index = Math.floor(numTracks * currentValue);
    if (index !== textIndex) {
      const origEl = document.getElementById("text-" + textIndex.toString());
      if (origEl) origEl.classList.remove("visible");
      textIndex = index;
      const newEl = document.getElementById("text-" + textIndex.toString());
      if (newEl) newEl.classList.add("visible");
    }
  }, textInterval * 1000);

  Tone.Transport.start();
  Tone.Transport.schedule(() => {
    Tone.Transport.stop();
    clearInterval(volumeIntervalHandle);
    clearInterval(textIntervalHandle);
    document.getElementById("text-container").style.opacity = 0;
    document.getElementById("refresh-text").style.transition = "opacity 2s 2s";
    document.getElementById("refresh-text").style.opacity = 1;
  }, totalTime);
  document.getElementById("intro-texts").remove();
  document.getElementById("play-button").remove();
  document.getElementById("text-container").classList.remove("hidden");
  const visitedTimes = window.localStorage.getItem("visited") || "0";
  const num = Number.parseInt(visitedTimes);
  window.localStorage.setItem("visited", (num + 1).toString());
}

function handleError(error, text) {
  Tone.Transport.stop();
  console.error(error);
  document.getElementById("error").classList.remove("hidden");
  if (text) document.getElementById("error").innerHTML = "<p>" + text + "</p>";
}

function interpolateTime(time) {
  //increment the listen data index if the time is greater than the next data time
  while (
    listenDataIndex + 1 < listenData.length &&
    listenData[listenDataIndex + 1].secs <= time
  ) {
    listenDataIndex++;
  }

  //just use last value if we are on the last one
  if (listenDataIndex === listenData.length - 1)
    return listenData[listenDataIndex].value;

  const prev = listenData[listenDataIndex];
  const next = listenData[listenDataIndex + 1];
  const normalizedSecs = (time - prev.secs) / (next.secs - prev.secs);
  const valueDifference = next.value - prev.value;
  return prev.value + normalizedSecs * valueDifference;
}

/** return the -dB modifiers for each track. Null is muted. Special track gets louder to its startFade time. */
function trackModifiers(value, numTracks, specialTrackIndex) {
  return new Array(numTracks).fill(0).map((_, index) => {
    const startFade = index / (numTracks - 1);
    const endFade = (index + 1) / (numTracks - 1);

    if (value >= endFade) return null;
    //specialTrack goes from -6 at x=0 to 0 at it's startFade
    if (index === specialTrackIndex && value <= startFade) {
      const percent = (startFade - value) / startFade;
      return 20 * Math.log10(1 - percent * specialTrackModifierPercent);
    }
    if (value <= startFade) return 0;
    const percent = 1 - (value - startFade) / (endFade - startFade);
    return 20 * Math.log10(percent);
  });
}

function getTimeAgo(time) {
  const now = new Date();
  const hours = Math.floor((now.valueOf() - time.valueOf()) / (1000 * 60 * 60));
  if (hours === 0) return "less than an hour ago";
  if (hours === 1) return "an hour ago";
  return hours.toString() + " hours ago";
}
