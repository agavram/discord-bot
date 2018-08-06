var token = require('./Discord_Token.js');
const Discord = require("discord.js");
const ud = require('urban-dictionary');
var schedule = require('node-schedule');
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
  bot.user.setActivity('f in chat boys')
});

var j = schedule.scheduleJob('00 * * * *', function(){
  var json_obj = JSON.parse(
            Get("https://www.reddit.com/r/dankmemes/hot.json")
          );
      var memeURL = json_obj.data.children[0].data.url;
      var memeTitle = json_obj.data.children[0].data.title;
  bot.channels.get("476157539013361684").send(memeTitle, {
    file: memeURL
  });
});

bot.on("message", message => {
  console.log("Channel: " + message.channel.id); });
//   if (!message.author.bot) {
//     var msg = message.content;
//     msg = msg.toLowerCase();
//     if (msg == "!meme") {
//       var json_obj = JSON.parse(
//         Get("https://www.reddit.com/r/dankmemes/hot.json")
//       );
//       var randNum = Math.floor(Math.random() * 21);
//       var memeURL = json_obj.data.children[randNum].data.url;
//       var memeTitle = json_obj.data.children[randNum].data.title;
//       message.channel.send(memeTitle, {
//         file: memeURL
//       });
//     }

//     if (msg.substring(0, 7) == "!define") {
//       msg.replace(/\s+/g, " ").trim()
//       msg.toLowerCase
//       if (msg.length == 7) {
//         message.channel.send("Use !define {term} to get the definition of a word from urban dictionary.");
//       } else {
//         var term = msg.substring(8, msg.length)
//         ud.term(term, function (error, entries, tags, sounds) {
//           if (error) {
//             message.channel.send("Could not find term: " + term);
//           } else {
//             message.channel.send(entries[0].word + ": " + entries[0].definition)
//             message.channel.send(entries[0].example)
//           }
//         })
//       }
//     }
//   }
// });

bot.login(token);
