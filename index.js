const phonetics = {
    A: "Alpha",
    B: "Bravo",
    C: "Charlie",
    D: "Delta",
    E: "Echo",
    F: "Foxtrot",
    G: "Golf",
    H: "Hotel",
    I: "India",
    J: "Juliet",
    K: "Kilo",
    L: "Lima",
    M: "Mike",
    N: "November",
    O: "Oscar",
    P: "Papa",
    Q: "Quebec",
    R: "Romeo",
    S: "Sierra",
    T: "Tango",
    U: "Uniform",
    V: "Victor",
    W: "Whiskey",
    X: "X-ray",
    Y: "Yankee",
    Z: "Zulu"
};
const Discord = require("discord.js");
const bot = new Discord.Client();

const moment = require("moment");
const ud = require("urban-dictionary");
const schedule = require("node-schedule");
const axios = require("axios");

var date = moment();

var lastDate = moment({
    day: date.date() + 2,
    month: date.month(),
    year: date.year()
});

bot.once("ready", () => {
    console.log(lastDate.toISOString());
    console.log(`Logged in as ${bot.user.tag}`);
    bot.user.setActivity("f in chat boys");
    var j = schedule.scheduleJob("0,30 * * * *", postMeme);
});

function postMeme() {
    posts = [];

    axios
        .get("https://www.reddit.com/r/dankmemes/hot.json")
        .then(function(response) {
            var json_obj = response.data;

            let previousPosts = await fetchPosts()
            while (previousPosts.length != 0 && posts.length < 48) {
                posts = posts.concat(previousPosts)
                previousPosts = await fetchPosts()
            }
            
            var index = 0;
            while (
                (json_obj.data.children.length != index &&
                    json_obj.data.children[index].data.stickied) ||
                posts.includes("https://www.reddit.com" + json_obj.data.children[index].data.permalink)
            ) {
                index++;
            }

            bot.channels.get("509569913543852033").send({
                embed: {
                    title: json_obj.data.children[index].data.title,
                    url:
                        "https://www.reddit.com" +
                        json_obj.data.children[index].data.permalink,
                    color: 16728368,
                    timestamp: new Date(
                        json_obj.data.children[index].data.created_utc * 1000
                    ).toISOString(),
                    footer: {},
                    image: {
                        url: json_obj.data.children[index].data.url
                    },
                    author: {
                        name: json_obj.data.children[index].data.author,
                        url:
                            "https://www.reddit.com/u/" +
                            json_obj.data.children[index].data.author
                    }
                }
            });
        })
        .catch(function(error) {
            bot.channels
                .get("509569913543852033")
                .send("Error connecting to reddit: " + error);
            console.log(error);
        });
}

bot.on("message", message => {
    if (!message.author.bot) {
        var msg = message.content;
        msg = msg.toLowerCase();

        if (msg.substring(0, 9) == "!phonetic") {
            var input = msg.substring(10, msg.length);
            var output = "";
            for (var i = 0; i < input.length; i++) {
                if (phonetics[input.charAt(i).toUpperCase()] !== undefined) {
                    output += phonetics[input.charAt(i).toUpperCase()] + " ";
                } else if (input.charAt(i) == " ") {
                    output = output.substring(0, output.length - 1) + "|";
                } else {
                    output =
                        output.substring(0, output.length - 1) +
                        input.charAt(i);
                }
            }
            message.channel.send(output);
        }

        if (msg.substring(0, 7) == "!define") {
            msg.replace(/\s+/g, " ").trim();
            if (msg.length == 7) {
                message.channel.send(
                    "Use !define {term} to get the definition of a word from urban dictionary."
                );
            } else {
                var term = msg.substring(8, msg.length);
                ud.term(term, function(error, entries, tags, sounds) {
                    if (error) {
                        message.channel.send("Could not find term: " + term);
                    } else {
                        message.channel.send(
                            entries[0].word +
                                ": " +
                                entries[0].definition.replace(/[\[\]']+/g, "")
                        );
                        message.channel.send(
                            entries[0].example.replace(/[\[\]']+/g, "")
                        );
                    }
                });
            }
        }
    }
});

function fetchPosts() {
    posts = [];
    bot.channels
        .get("509569913543852033")
        .fetchMessages({ limit: 100 })
        .then(messages => {
            messages = messages.filter(
                m => m.author.id === "377315020368773121"
            );
            messages.forEach(msg => {
                msg.embeds.forEach(embed => {
                    posts.push(embed.url);
                });
            });
        })
        .catch(console.error);
    return posts;
}

bot.on("error", info => {
    console.log("Error event:\n" + info.message);
});

bot.on("disconnect", console.log);

bot.login(process.env.BOT_TOKEN);
