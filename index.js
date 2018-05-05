const Discord = require("discord.js");
const bot = new Discord.Client();

function Get(yourUrl) {
  var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
  var Httpreq = new XMLHttpRequest();
  Httpreq.open("GET", yourUrl, false);
  Httpreq.send(null);
  return Httpreq.responseText;
}

bot.on("ready", () => {
  console.log(`Logged in as ${bot.user.tag}`);
});

bot.on("message", message => {
  console.log("Channel: " + message.channel);
  if (!message.author.bot) {
    var msg = message.content;
    msg = msg.toLowerCase();
    if (msg == "!meme") {
      var json_obj = JSON.parse(
        Get("https://www.reddit.com/r/dankmemes/hot.json")
      );
      var randNum = Math.floor(Math.random() * 21);
      var memeURL = json_obj.data.children[randNum].data.url;
      var memeTitle = json_obj.data.children[randNum].data.title;
      message.channel.send(memeTitle, {
        file: memeURL
      });
    }

    // I know I need a better way of searching through the array
    var badWords = require("badwords/array");
    for (var i = 0; i < badWords.length; i++) {
      if (msg.search(badWords[i]) != -1) {
        var msg = badWords[i];
        message.channel.send(
          "Whoa u said " + badWords[i] + ". Watch your language kiddo.",
          {
            // file: 'https://i.imgur.com/DpxncM2.jpg'
          }
        );
      }
    }

    if (
      msg.search("you are") != -1 ||
      msg.search("ur") != -1 ||
      msg.search("no u") != -1
    ) {
      message.channel.send("no u");
    }

    var lordsName = ["jesus", "god", "alan", "yao"];
    for (var i = 0; i < lordsName.length; i++) {
      if (msg.search(lordsName[i]) != -1) {
        message.channel.send(
          "Please do not use the Lord's name (" + lordsName[i] + ") in vain."
        );
        break;
      }
    }
  }
});

bot.login("Mzc3MzE1MDIwMzY4NzczMTIx.DOLJiw.nQypjLTe-ZjNHEUPtFDVG4HljYg");
