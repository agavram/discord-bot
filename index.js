var token = require('./Discord_Token.js');
const Discord = require("discord.js");
var moment = require('moment');
// const ud = require('urban-dictionary');

var schedule = require('node-schedule');
var date = moment();
var lastDate = moment({day: date.date(), month: date.month(), year: date.year()});
const bot = new Discord.Client();
console.log(lastDate.toISOString());
var posts = [];


function Get(yourUrl) {
  var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
  var Httpreq = new XMLHttpRequest();
  Httpreq.open("GET", yourUrl, false);
  Httpreq.send(null);
  return Httpreq.responseText;
}

bot.on("ready", () => {
  console.log(`Logged in as ${bot.user.tag}`);
  bot.user.setActivity('f in chat boys');
  // var json_obj = JSON.parse(
  //   Get("https://www.reddit.com/r/dankmemes/hot.json")
  // );
});

var j = schedule.scheduleJob('00 * * * *', function () {
  if(moment() > lastDate) {
    date = moment();
    lastDate = moment({day: date.date(), month: date.month(), year: date.year()});
    posts = [];
  }

  var json_obj = JSON.parse(
    Get("https://www.reddit.com/r/dankmemes/hot.json")
  );
  var index = 0;
  var sticked = json_obj.data.children[index].data.stickied;
  if (sticked) {
    index++;
    sticked = json_obj.data.children[index].data.stickied;
  }
  
  for (let i = 0; i < posts.length; i++) {
    if(json_obj.data.children[index].data.title == posts[i]) {
      index++;
    } else {
      posts.push(son_obj.data.children[index].data.title);
      break;
    }
  }

  bot.channels.get("476157539013361684").send({
    embed: {
      title: json_obj.data.children[index].data.title,
      url: ("https://www.reddit.com" + json_obj.data.children[index].data.permalink),
      color: 16728368,
      timestamp: new Date(json_obj.data.children[index].data.created_utc * 1000).toISOString(),
      footer: {},
      image: {
        url: json_obj.data.children[index].data.url
      },
      author: {
        "name": json_obj.data.children[index].data.author,
        "url": ("https://www.reddit.com/u/" + json_obj.data.children[index].data.author)
      }
    }
  });
});

// bot.on("message", message => {
//   console.log("Channel: " + message.channel.id); });
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
