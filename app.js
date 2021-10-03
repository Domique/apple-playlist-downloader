const fs = require("fs");
request = require("request");
var ProgressBar = require("progress");
const axios = require("axios");
const NodeID3 = require("node-id3");
const itunesAPI = require("node-itunes-search");

const INFO_URL = "https://slider.kz/vk_auth.php?q=";
const DOWNLOAD_URL = "https://slider.kz/download/";
let index = -1;
let songsList = [];
let total = 0;
let notFound = [];

const download = async (song, url, song_name, singer_names, query_artwork) => {
  try {
    let numb = index + 1;
    console.log(`(${numb}/${total}) Starting download: ${song}`);
    const { data, headers } = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
    });

    //for progress bar...
    const totalLength = headers["content-length"];
    const progressBar = new ProgressBar(
      "-> downloading [:bar] :percent :etas",
      {
        width: 40,
        complete: "=",
        incomplete: " ",
        renderThrottle: 1,
        total: parseInt(totalLength),
      }
    );

    data.on("data", (chunk) => progressBar.tick(chunk.length));
    data.on("end", () => {
      singer_names = singer_names.replace(/\s{2,10}/g, "");
      console.log("DOWNLOADED!");
      const filepath = `${__dirname}/songs/${song}.mp3`;
      //Replace all connectives by a simple ','
      singer_names = singer_names.replace(" and ", ", ");
      singer_names = singer_names.replace(" et ", ", ");
      singer_names = singer_names.replace(" und ", ", ");
      singer_names = singer_names.replace(" & ", ", ");
      //Search track informations using the Itunes library
      const searchOptions = new itunesAPI.ItunesSearchOptions({
        term: query_artwork, // All searches require a single string query.

        limit: 1, // An optional maximum number of returned results may be specified.
      });
      //Use the result to extract tags
      itunesAPI.searchItunes(searchOptions).then((result) => {
        // Get all the tags and cover art of the track using node-itunes-search and write them with node-id3
        let maxres = result.results[0]["artworkUrl100"].replace(
          "100x100",
          "3000x3000"
        );
        let year = result.results[0]["releaseDate"].substring(0, 4);
        let genre = result.results[0]["primaryGenreName"].replace(
          /\?|<|>|\*|"|:|\||\/|\\/g,
          ""
        );
        let trackNumber = result.results[0]["trackNumber"];
        let trackCount = result.results[0]["trackCount"];
        trackNumber = trackNumber + "/" + trackCount;
        let album = result.results[0]["collectionName"].replace(
          /\?|<|>|\*|"|:|\||\/|\\/g,
          ""
        );
        //console.log(genre);
        //console.log(year);
        //console.log(trackNumber);
        //console.log(album);
        //console.log(maxres);
        let query_artwork_file = query_artwork + ".jpg";
        download_artwork(maxres, query_artwork_file, function () {
          //console.log('Artwork downloaded');
          const tags = {
            TALB: album,
            title: song_name,
            artist: singer_names,
            APIC: query_artwork_file,
            year: year,
            trackNumber: trackNumber,
            genre: genre,
          };
          //console.log(tags);
          const success = NodeID3.write(tags, filepath);
          console.log("WRITTEN TAGS");
          try {
            fs.unlinkSync(query_artwork_file);
            //file removed
          } catch (err) {
            console.error(err);
          }
          startDownloading(); //for next song!
        });
      });
    });

    //for saving in file...
    data.pipe(fs.createWriteStream(`${__dirname}/songs/${song}.mp3`));
  } catch {
    console.log("some error came!");
    startDownloading(); //for next song!
  }
};
var download_artwork = function (uri, filename, callback) {
  request.head(uri, function (err, res, body) {
    //console.log('content-type:', res.headers['content-type']);
    //console.log('content-length:', res.headers['content-length']);

    request(uri).pipe(fs.createWriteStream(filename)).on("close", callback);
  });
};
const getURL = async (song, singer) => {
  let query = (song + "%20" + singer).replace(/\s/g, "%20");
  // console.log(INFO_URL + query);
  const { data } = await axios.get(encodeURI(INFO_URL + query));

  if (data["audios"][""].length < 1) {
    //no result
    console.log("==[ SONG NOT FOUND! ]== : " + song);
    notFound.push(song + " - " + singer);
    startDownloading();
    return;
  }

  //avoid remix,revisited,mix
  let i = 0;
  let track = data["audios"][""][i];
  while (/remix|revisited|mix/i.test(track.tit_art)) {
    i += 1;
    track = data["audios"][""][i];
  }
  //if reach the end then select the first song
  if (!track) {
    track = data["audios"][""][0];
  }

  if (fs.existsSync(__dirname + "/songs/" + track.tit_art + ".mp3")) {
    let numb = index + 1;
    console.log("("+numb+"/"+total+") - Song already present!!!!! " + song);
    startDownloading(); //next song
    return;
  }

  let link = DOWNLOAD_URL + track.id + "/";
  link = link + track.duration + "/";
  link = link + track.url + "/";
  link = link + track.tit_art + ".mp3" + "?extra=";
  link = link + track.extra;
  link = encodeURI(link); //to replace unescaped characters from link

  let songName = track.tit_art;
  songName.replace(/\?|<|>|\*|"|:|\||\/|\\/g, ""); //removing special characters which are not allowed in file name
  download(songName, link, song, singer, track.tit_art);
};

const startDownloading = () => {
  index += 1;
  if (index === songsList.length) {
    console.log("\n#### ALL SONGS ARE DOWNLOADED!! ####\n");
    console.log("Songs that are not found:-");
    let i = 1;
    for (let song of notFound) {
      console.log(`${i} - ${song}`);
      i += 1;
    }
    if (i === 1) console.log("None!");
    return;
  }
  let song = songsList[index].name;
  let singer = songsList[index].singer;
  getURL(song, singer);
};

console.log("STARTING....");
let playlist = require("./apple_playlist");
playlist.getPlaylist().then((res) => {
  if (res === "Some Error") {
    //wrong url
    console.log(
      "Error: maybe the url you inserted is not of apple music playlist or check your connection!"
    );
    return;
  }
  songsList = res.songs;
  total = res.total;
  console.log("Total songs:" + total);

  //create folder
  let dir = __dirname + "/songs";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  startDownloading();
});
