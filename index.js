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

    postMissing();
});

async function postMissing() {
    if (process.argv.length > 2) {
        for (let index = 0; index < process.argv[2]; index++) {
            await postMeme();
        }
    }
}

async function postMeme() {
    posts = [];

    await axios
        .get("https://www.reddit.com/r/dankmemes/hot.json")
        .then(function (response) {
            var json_obj = response.data;
            var index = 0;
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

                    while (
                        (json_obj.data.children.length != index &&
                            json_obj.data.children[index].data.stickied) ||
                        posts.includes(
                            "https://www.reddit.com" +
                            json_obj.data.children[index].data.permalink
                        )
                    ) {
                        index++;
                    }

                    var mediaUrl;
                    if (json_obj.data.children[index].data.media != null) {
                        mediaUrl =
                            json_obj.data.children[index].data.media.oembed
                                .thumbnail_url;
                    } else {
                        mediaUrl = json_obj.data.children[index].data.url;
                    }
                    console.log(mediaUrl);
                    bot.channels.get("509569913543852033").send({
                        embed: {
                            title: json_obj.data.children[index].data.title,
                            url:
                                "https://www.reddit.com" +
                                json_obj.data.children[index].data.permalink,
                            color: 16728368,
                            timestamp: new Date(
                                json_obj.data.children[index].data.created_utc *
                                1000
                            ).toISOString(),
                            footer: {},
                            image: {
                                url: mediaUrl
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
                .catch(console.error);
        })
        .catch(function (error) {
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
                ud.term(term, function (error, entries, tags, sounds) {
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

bot.on("error", info => {
    console.log("Error event:\n" + info.message);
});

const events = {
    MESSAGE_REACTION_ADD: "messageReactionAdd",
    MESSAGE_REACTION_REMOVE: "messageReactionRemove"
};

bot.on("raw", async event => {
    if (!events.hasOwnProperty(event.t)) return;

    const { d: data } = event;
    const user = bot.users.get(data.user_id);
    const channel =
        bot.channels.get(data.channel_id) || (await user.createDM());

    if (channel.messages.has(data.message_id)) return;

    const message = await channel.fetchMessage(data.message_id);

    const emojiKey = data.emoji.id
        ? `${data.emoji.name}:${data.emoji.id}`
        : data.emoji.name;
    let reaction = message.reactions.get(emojiKey);

    if (!reaction) {
        const emoji = new Discord.Emoji(
            bot.guilds.get(data.guild_id),
            data.emoji
        );
        reaction = new Discord.MessageReaction(
            message,
            emoji,
            1,
            data.user_id === bot.user.id
        );
    }
    bot.emit(events[event.t], reaction, user, message.guild.id);
});

bot.on("messageReactionAdd", (reaction, user, guild_id) => {
    console.log("message: " + guild_id);
    if ((reaction.emoji.name === 'upvote' || reaction.emoji.name === "👏") && reaction.message.embeds.length != 0 && reaction.message.author.id === "377315020368773121") {
        bot.channels
            .get("509566135713398796")
            .fetchMessages({ limit: 100 })
            .then(messages => {
                messages = messages.filter(
                    m => m.author.id === "377315020368773121"
                );
                var send = true;
                messages.forEach(msg => {
                    msg.embeds.forEach(embed => {
                        if (embed.url == reaction.message.embeds[0].url) {
                            send = false
                        }
                    });
                });
                
                if (send) {
                    let guild = bot.guilds.get("509566135713398794");
                    let member = guild.member(user);
                    reaction.message.embeds[0].footer = { text: member.displayName + " shared this meme" };
                    bot.channels.get("509566135713398796").send({ embed: reaction.message.embeds[0] })
                }
            });
    }
});

bot.on("messageDelete", message => {
    bot.channels.get("628970565042044938").send(message.author.username)
    bot.channels.get("628970565042044938").send("Content: " + message.content)
});

bot.on("disconnect", console.log);
var token = require("./Discord_Token.js");
bot.login(token);
