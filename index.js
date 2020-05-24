const Discord = require("discord.js");
const bot = new Discord.Client();
const schedule = require("node-schedule");
const axios = require("axios");
const phonetics = require('./phonetic-alphabet');

bot.once("ready", () => {
    console.log(`Logged in as ${bot.user.tag}`);
    // bot.user.setActivity("");
    // Every half hour post a meme
    let j = schedule.scheduleJob("0,30 * * * *", postMeme);

    postArgument();
});


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
                .get("509569913543852033")
                .send("Reddit is down with status code: " + error);
            console.log(error);
        });

    json_obj = response.json_obj;
    let index = 0;
    // Fetches 100 messages from the dank memes channel
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

            bot.channels.get("509569913543852033").send({
                embed
            });

            // Only send video if it was an mp4
            if (mediaUrl.substring(mediaUrl.length - 3) === 'mp4') {
                bot.channels.get('509569913543852033').send({
                    files: [mediaUrl]
                });
            }

        })
        .catch(console.error);
}

bot.on("message", message => {
    if (!message.author.bot) {
        let msg = message.content; msg = msg.toLowerCase();

        if (msg.substring(0, 9) == "!phonetic") {
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
    if ((reaction.emoji.name === 'upvote' || reaction.emoji.name === "👏") && reaction.message.embeds.length != 0 && reaction.message.author.id === "377315020368773121") {
        bot.channels
            .get("509566135713398796")
            .fetchMessages({ limit: 100 })
            .then(messages => {
                // Filter out mesages from the bot
                messages = messages.filter(
                    m => m.author.id === "377315020368773121"
                );

                // Check if meme was already posted
                messages.forEach(msg => {
                    msg.embeds.forEach(embed => {
                        if (embed.url == reaction.message.embeds[0].url) {
                            return;
                        }
                    });
                });

                let guild = bot.guilds.get("509566135713398794");
                // State who shared the meme
                reaction.message.embeds[0].footer = { text: guild.member(user).displayName + " shared this meme" };

                // Finally send the meme
                bot.channels.get("509566135713398796").send({ embed: reaction.message.embeds[0] });

                // Check if video was included in description. If so then send that too
                if (reaction.message.embeds[0].description != null && reaction.message.embeds[0].description != '') {
                    bot.channels.get('509566135713398796').send({
                        files: [reaction.message.embeds[0].description]
                    });
                }
            });
    }
});

bot.on("messageDelete", message => {
    bot.channels.get("628970565042044938").send(message.author.username);
    bot.channels.get("628970565042044938").send("Content: " + message.content);
});

bot.on("disconnect", console.log);
bot.login(require("./discord-token.js"));
