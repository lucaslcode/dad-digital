let client;
let players;
let pingLoop;
let playButton;
let playData;

const pingInterval = 2; //seconds

window.addEventListener("load", function () {
  playButton = document.getElementById("play-button");
  init();
})

async function init() {
  client = window.supabase.createClient("https://gbpmhxxqzickphlaeahr.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzODg4Njc4MiwiZXhwIjoxOTU0NDYyNzgyfQ.NWerKi-e0T9awTFjXTvUYmR6fv2FgHtPpj4O1zPnbuU");
  let { data, error } = await client
    .rpc('init', {
      _piece_id: 1
    });
  if (error) {
    handleError(error);
    throw error;
  }



  //load
  await new Promise(function (resolve) { setTimeout(resolve, 500) });

  playButton.addEventListener("click", onPlayClick);
  playButton.disabled = false;


}

async function onPlayClick() {
  await Tone.start()

  pingLoop = new Tone.Loop(async function (time) {
    const roundedTime = Math.floor(time)
    console.debug("Sending ping:", roundedTime);
    let { data, error } = await client.rpc('listen', {
      _piece_id: 1,
      _secs: roundedTime,
    });
    if (error) {
      handleError(error);
      throw error;
    }
  }, pingInterval).start(0);

  Tone.Transport.start();
  playButton.remove();
}

function handleError(error) {
  Tone.Transport.stop();
}

//tone.js
// player1
//       .toMaster()
//       .sync()
//       .start(1.555)

//     player2
//       .toMaster()
//       .sync()
//       .start(4.1)

//     Tone.Transport.start("+0")