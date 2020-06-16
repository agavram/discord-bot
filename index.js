const Discord = require("discord.js");
const bot = new Discord.Client();
const schedule = require("node-schedule");
const axios = require("axios");
const phonetics = require('./phonetic-alphabet');
const Sherlock = require('sherlockjs');
const fs = require('fs');

const BOT_ID = "657393851614494721";
// 377315020368773121
const GENERAL_ID = "509566135713398796";
const DANKMEMES_ID = "509569913543852033";
const LOG_CHANNEL = "628970565042044938";

let events;

bot.once("ready", () => {
    console.log(`Logged in as ${bot.user.tag}`);
    initializeEvents();
    // bot.user.setActivity("");
    // Every half hour post a meme
    let j = schedule.scheduleJob("0,30 * * * *", postMeme);

    postArgument();
});

function initializeEvents() {
    events = JSON.parse(fs.readFileSync('./events.json'));
    Object.keys(events).forEach(function (key) {
        scheduleEventJob(key);
    });
}

function scheduleEventJob(key) {
    schedule.scheduleJob(key, function () {
        const attendees = events[key];
        for (let index = 1; index < attendees.length; index++) {
            const attendee = attendees[index];
            bot.users.get(attendee).send(attendees[0] + " is happening right now");
        }
        delete events[key];
        updateJSON(events);
    });
}


/**
 * Pass in a number as an argument
 * node index.js 3
 * will post 3 memes immediately when the bot goes online
 */
async function postArgument() {
    if (process.argv.length > 2) {
        for (let index = 0; index < process.argv[2]; index++) {
            await postMeme();
        }
    }
}

/**
 * Fetch a meme from r/dankmemes and post it
 */
async function postMeme() {
    let posts = [];

    let json_obj = await axios
        .get("https://www.reddit.com/r/dankmemes/hot.json")
        .catch(function (error) {
            bot.channels
                .get(DANKMEMES_ID)
                .send("Reddit is down with status code: " + error);
            console.log(error);
        });

    json_obj = json_obj.data;
    let index = 0;
    // Fetches 100 messages from the dank memes channel
    bot.channels
        .get(DANKMEMES_ID)
        .fetchMessages({ limit: 100 })
        .then(messages => {
            messages = messages.filter(
                m => m.author.id === BOT_ID
            );
            messages.forEach(msg => {
                msg.embeds.forEach(embed => {
                    posts.push(embed.url);
                });
            });

            // If the post is sticked (mod post), already posted (check the past 100 messages), or is from idea4granted, then skip it
            while (json_obj.data.children[index].data.stickied ||
                posts.includes("https://www.reddit.com" + json_obj.data.children[index].data.permalink) ||
                json_obj.data.children[index].data.author === "idea4granted"
            ) {
                index++;
            }

            let mediaUrl;
            // Attempt to get an image
            if (json_obj.data.children[index].data.media != null) {
                mediaUrl =
                    json_obj.data.children[index].data.media.oembed
                        .thumbnail_url;
                // If no image is available get a gif
            } else {
                mediaUrl = json_obj.data.children[index].data.url;
            }

            // Generate the embed to post to discord
            let embed = {
                title: json_obj.data.children[index].data.title,
                url:
                    "https://www.reddit.com" +
                    json_obj.data.children[index].data.permalink,
                color: 16728368,
                timestamp: new Date(
                    json_obj.data.children[index].data.created_utc *
                    1000
                ).toISOString(),

                author: {
                    name: json_obj.data.children[index].data.author,
                    url:
                        "https://www.reddit.com/u/" +
                        json_obj.data.children[index].data.author
                }
            };

            // Check if post is video from imgur. gifv is properietary so change the url to mp4
            if (mediaUrl.includes('i.imgur.com') && mediaUrl.substring(mediaUrl.length - 4) === 'gifv') {
                mediaUrl = mediaUrl.substring(0, mediaUrl.length - 4) + "mp4";
                embed.description = mediaUrl;
            } else {
                embed.image = {
                    url: mediaUrl
                };
            }

            bot.channels.get(DANKMEMES_ID).send({
                embed
            });

            // Only send video if it was an mp4
            if (mediaUrl.substring(mediaUrl.length - 3) === 'mp4') {
                bot.channels.get(DANKMEMES_ID).send({
                    files: [mediaUrl]
                });
            }

        })
        .catch(console.error);
}

bot.on("message", message => {
    if (!message.author.bot) {
        let msg = message.content; msg = msg.toLowerCase();

        if (msg.startsWith("!phonetic")) {
            let input = msg.substring(10, msg.length);
            let output = "";

            for (let i = 0; i < input.length; i++) {
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
        } else if (msg.startsWith("!event")) {
            msg = msg.substring(msg.indexOf(' ') + 1);
            const parsed = Sherlock.parse(msg);

            // Generate the embed to post to discord
            let embed = {
                title: parsed.eventTitle,
                fields: [],
                timestamp: parsed.startDate,
            };

            message.channel.send({
                embed
            }).then(sent => {
                sent.react("✅");
                events[sent.embeds[0].timestamp] = [parsed.eventTitle];
                scheduleEventJob(sent.embeds[0].timestamp);
                updateJSON(events);
            });
        }
    }
});

bot.on("error", info => {
    console.log("Error event:\n" + info.message);
});

bot.on('raw', packet => {
    // We don't want this to run on unrelated packets
    if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'].includes(packet.t)) return;
    // Grab the channel to check the message from
    const channel = bot.channels.get(packet.d.channel_id);
    // There's no need to emit if the message is cached, because the event will fire anyway for that
    if (channel.messages.has(packet.d.message_id)) return;
    // Since we have confirmed the message is not cached, let's fetch it
    channel.fetchMessage(packet.d.message_id).then(message => {
        // Emojis can have identifiers of name:id format, so we have to account for that case as well
        const emoji = packet.d.emoji.id ? `${packet.d.emoji.name}:${packet.d.emoji.id}` : packet.d.emoji.name;
        // This gives us the reaction we need to emit the event properly, in top of the message object
        const reaction = message.reactions.get(emoji);
        // Adds the currently reacting user to the reaction's users collection.
        if (reaction) reaction.users.set(packet.d.user_id, bot.users.get(packet.d.user_id));
        // Check which type of event it is before emitting
        if (packet.t === 'MESSAGE_REACTION_ADD') {
            bot.emit('messageReactionAdd', reaction, bot.users.get(packet.d.user_id));
        }
        if (packet.t === 'MESSAGE_REACTION_REMOVE') {
            bot.emit('messageReactionRemove', reaction, bot.users.get(packet.d.user_id));
        }
    });
});

bot.on('messageReactionRemove', (reaction, user) => {
    if (reaction.emoji.name == '✅' && reaction.message.author.id === BOT_ID && reaction.message.channel.id != DANKMEMES_ID) {
        const embed = reaction.message.embeds[0];
        embed.fields = embed.fields.filter(field => field.value != bot.guilds.get(reaction.message.guild.id).member(user).displayName);
        reaction.message.edit(new Discord.RichEmbed(embed)).then(_ => {
            events[embed.timestamp] = removeItemOnce(events[embed.timestamp], user.id);
            updateJSON(events);
        });
    }
});

function updateJSON(events) {
    fs.writeFileSync("./events.json", JSON.stringify(events));
}

function removeItemOnce(arr, value) {
    var index = arr.indexOf(value);
    if (index > -1) {
        arr.splice(index, 1);
    }
    return arr;
}

bot.on("messageReactionAdd", (reaction, user) => {
    if (user.bot)
        return;

    if ((reaction.emoji.name === 'upvote') && reaction.message.embeds.length != 0 && reaction.message.author.id === BOT_ID) {
        bot.channels
            .get(GENERAL_ID)
            .fetchMessages({ limit: 100 })
            .then(messages => {
                // Filter out mesages from the bot
                messages = messages.filter(
                    m => m.author.id === BOT_ID
                );

                // Check if meme was already posted
                messages.forEach(msg => {
                    msg.embeds.forEach(embed => {
                        if (embed.url == reaction.message.embeds[0].url) {
                            return;
                        }
                    });
                });

                let guild = bot.guilds.get(reaction.message.guild.id);
                // State who shared the meme
                reaction.message.embeds[0].footer = { text: guild.member(user).displayName + " shared this meme" };

                // Finally send the meme
                bot.channels.get(GENERAL_ID).send({ embed: reaction.message.embeds[0] });

                // Check if video was included in description. If so then send that too
                if (reaction.message.embeds[0].description != null && reaction.message.embeds[0].description != '') {
                    bot.channels.get(GENERAL_ID).send({
                        files: [reaction.message.embeds[0].description]
                    });
                }
            });
    }

    if (reaction.emoji.name == '✅' && reaction.message.author.id === BOT_ID && reaction.message.channel.id != DANKMEMES_ID) {
        const embed = reaction.message.embeds[0];
        embed.fields.push(
            {
                name: "Attendee",
                value: bot.guilds.get(reaction.message.guild.id).member(user).displayName,
            },
        );
        reaction.message.edit(new Discord.RichEmbed(embed)).then(_ => {
            events[embed.timestamp].push(user.id);
            updateJSON(events);
        });
    }
});

bot.on("messageDelete", message => {
    bot.channels.get(LOG_CHANNEL).send(message.author.username);
    bot.channels.get(LOG_CHANNEL).send("Content: " + message.content);
});

bot.on("disconnect", console.log);
bot.login(require("./Discord_Token.js"));
