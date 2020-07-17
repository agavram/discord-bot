const Discord = require("discord.js");
const bot = new Discord.Client();
const schedule = require("node-schedule");
const axios = require("axios");
const phonetics = require('helpers/phonetic-alphabet');
const Sherlock = require('sherlockjs');
const fs = require('fs');

const BOT_ID = "377315020368773121";
const CHANNEL_GENERAL = "509566135713398796";
const CHANNEL_MEMES = "509569913543852033";
const CHANNEL_LOGGING = "628970565042044938";

require('dotenv').config()

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
    events = JSON.parse(fs.readFileSync('.databases/events.json'));
    Object.keys(events).forEach(function (key) {
        scheduleEventJob(key);
    });
}

function scheduleEventJob(key) {
    if (Date.parse(key) < Date.now()) {
        delete events[key];
        updateJSON(events);
    } else {
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
}


/**
 * Pass in a number as an argument
 * node index.js 3
 * will post 3 memes immediately when the bot goes online
 */
async function postArgument() {
    if (process.argv.length > 2) {
        // parseInt(*, 10) for base 10
        for (let index = 0; index < parseInt(process.argv[2], 10); index++) {
            await postMeme();
        }
    }
}

/**
 * Fetch a meme from r/dankmemes and post it
 */
async function postMeme() {
    let res = await axios
        .get("https://www.reddit.com/r/dankmemes/hot.json")
        .catch(function (error) {
            bot.channels
                .get(CHANNEL_MEMES)
                .send("Reddit is down with status code: " + error);
            console.log(error);
        });

    let json_obj = res.data;

    // Fetches 100 messages from the dank memes channel
    bot.channels
        .get(CHANNEL_MEMES)
        .fetchMessages({ limit: 100 })
        .then(messages => {
            messages = messages.filter(
                m => m.author.id === BOT_ID
            );

            let posts = [];
            messages.forEach(msg => {
                msg.embeds.forEach(embed => {
                    posts.push(embed.url);
                });
            });

            for (let index = 0; index < json_obj.data.children.length; index++) {
                const post : Reddit.Data2 = json_obj.data.children[index].data;

                // If the post is sticked (mod post), already posted (check the past 100 messages), or is from idea4granted, then skip it
                while (post.stickied ||
                    posts.includes("https://www.reddit.com" + post.permalink) ||
                    post.author === "idea4granted"
                ) {
                    continue;
                }

                let mediaUrl;
                // Attempt to get an image
                if (post.media != null) {
                    mediaUrl =
                        post.media.oembed
                            .thumbnail_url;
                    // If no image is available get a gif
                } else {
                    mediaUrl = post.url;
                }

                // Generate the embed to post to discord
                let embed = {
                    title: post.title,
                    url:
                        "https://www.reddit.com" +
                        post.permalink,
                    color: 16728368,
                    timestamp: new Date(
                        post.created_utc *
                        1000
                    ).toISOString(),

                    author: {
                        name: post.author,
                        url:
                            "https://www.reddit.com/u/" +
                            post.author
                    },

                    description: {},

                    image: {}
                };

                // Check if post is video from imgur. gifv is proprietary so change the url to mp4
                if (mediaUrl.includes('imgur.com') && mediaUrl.substring(mediaUrl.length - 4) === 'gifv') {
                    mediaUrl = mediaUrl.substring(0, mediaUrl.length - 4) + "mp4";
                    embed.description = mediaUrl;
                } else {
                    embed.image = {
                        url: mediaUrl
                    };
                }

                bot.channels.get(CHANNEL_MEMES).send({
                    embed
                });

                // Only send video if it was an mp4
                if (mediaUrl.substring(mediaUrl.length - 3) === 'mp4') {
                    bot.channels.get(CHANNEL_MEMES).send({
                        files: [mediaUrl]
                    });
                }

                
            }
        })
        .catch(console.error);
}

bot.on("message", message => {
    if (!message.author.bot && message.channel.type.toLowerCase() === 'text') {
        
        let msg = message.content; msg = msg.toLowerCase();

        if (msg.startsWith("!phonetic ")) {
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
        } 
        
        if (msg.startsWith("!event ")) {
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
                if (parsed.startDate && new Date(parsed.startDate) > new Date()) {
                    events[sent.embeds[0].timestamp] = [parsed.eventTitle];
                    scheduleEventJob(sent.embeds[0].timestamp);
                    updateJSON(events);
                }
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
    const guild = bot.guilds.get(reaction.message.guild.id);

    if (reaction.emoji.name == '✅' && reaction.message.author.id === BOT_ID && reaction.message.channel.id != CHANNEL_MEMES) {
        const embed = reaction.message.embeds[0];
        embed.fields = embed.fields.filter(field => field.value != guild.member(user).displayName);
        
        reaction.message.edit(new Discord.RichEmbed(embed)).then(_ => {
            if (embed.timestamp in events) {
                events[embed.timestamp] = removeItemOnce(events[embed.timestamp], user.id);
                updateJSON(events);
            }
        });
    }
});

function updateJSON(events) {
    fs.writeFileSync("databases/events.json", JSON.stringify(events));
}

function removeItemOnce(arr, value) {
    var index = arr.indexOf(value);
    if (index > -1) {
        arr.splice(index, 1);
    }
    return arr;
}

bot.on("messageReactionAdd", (reaction, user) => {
    if (user.bot) {
        return;
    }

    const guild = bot.guilds.get(reaction.message.guild.id);
    if ((reaction.emoji.name === 'upvote') && reaction.message.embeds.length != 0 && reaction.message.author.id === BOT_ID) {
        bot.channels
            .get(CHANNEL_GENERAL)
            .fetchMessages({ limit: 100 })
            .then(messages => {
                // Filter out mesages from the bot
                messages = messages.filter(
                    m => m.author.id === BOT_ID
                );

                // Check if meme was already posted
                let shouldExit = false;
                
                messages.forEach(msg => {
                    msg.embeds.forEach(embed => {
                        if (embed.url == reaction.message.embeds[0].url) {
                            shouldExit = true;
                        }
                    });
                });

                if (shouldExit) {
                    return;
                }

                // State who shared the meme
                reaction.message.embeds[0].footer = { text: guild.member(user).displayName + " shared this meme" };

                // Finally send the meme
                bot.channels.get(CHANNEL_GENERAL).send({ embed: reaction.message.embeds[0] });

                // Check if video was included in description. If so then send that too
                if (reaction.message.embeds[0].description != null && reaction.message.embeds[0].description != '') {
                    bot.channels.get(CHANNEL_GENERAL).send({
                        files: [reaction.message.embeds[0].description]
                    });
                }
            });
    }

    if (reaction.emoji.name == '✅' && reaction.message.author.id === BOT_ID && reaction.message.channel.id != CHANNEL_MEMES) {
        const embed = reaction.message.embeds[0];

        for (let i = 0; i < embed.fields.length; i++) {
            const field = embed.fields[i];
            if (field.value === guild.member(user).displayName) {
                return false;
            }
        }

        embed.fields.push(
            {
                name: "Attendee",
                value: guild.member(user).displayName,
            },
        );

        reaction.message.edit(new Discord.RichEmbed(embed)).then(_ => {
            if (embed.timestamp in events) {
                events[embed.timestamp].push(user.id);
                updateJSON(events);
            }
        });
    }
});

bot.on("messageDelete", message => {
    bot.channels.get(CHANNEL_LOGGING).send(message.author.username);
    bot.channels.get(CHANNEL_LOGGING).send("Content: " + message.content);
});

bot.on("disconnect", console.log);
bot.login(require("./tokens/discordToken.js"));
