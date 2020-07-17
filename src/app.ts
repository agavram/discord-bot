const Discord = require('discord.js');
const client = new Discord.Client({ partials: ['MESSAGE', 'REACTION']});
const schedule = require('node-schedule');
const axios = require('axios');
const phonetics = require('./helpers/phonetic-alphabet');
const Sherlock = require('sherlockjs');
const fs = require('fs');
const Reddit = require('./interfaces/reddit');

const CHANNEL_GENERAL = '509566135713398796';
const CHANNEL_MEMES = '509569913543852033';
const CHANNEL_LOGGING = '628970565042044938';
const DB_PATH = "./src/databases/events.json"

require('dotenv').config()

let events;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    initializeEvents();

    // Every half hour post a meme
    schedule.scheduleJob('0,30 * * * *', postMeme);

    postArgument();
});

function initializeEvents() {
    events = JSON.parse(fs.readFileSync(DB_PATH));
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
                client.users.resolve(attendee).send(attendees[0] + ' is happening right now');
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
        .get('https://www.reddit.com/r/dankmemes/hot.json')
        .catch(function (error) {
            client.channels
                .resolve(CHANNEL_MEMES)
                .send('Reddit is down with status code: ' + error);
            console.log(error);
        });

    let json_obj = res.data;
    
    // Fetches 100 messages from the dank memes channel
    client.channels
        .resolve(CHANNEL_MEMES)
        .messages.fetch({ limit: 100 })
        .then(messages => {
            // Get only messages from the bot
            messages = messages.filter(
                m => m.author.id === client.user.id
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
                if (post.stickied ||
                    posts.includes('https://www.reddit.com' + post.permalink) ||
                    post.author === 'idea4granted') {
                    continue;
                }

                let mediaUrl;
                // Attempt to get an image
                mediaUrl = post.media == null ? post.url : post.media.oembed.thumbnail_url;

                // Generate the embed to post to discord
                let embed : any = {
                    title: post.title,
                    url: 'https://www.reddit.com' + post.permalink,
                    color: 16728368,
                    timestamp: post.created_utc * 1000,
                    author: {
                        name: post.author,
                        url: 'https://www.reddit.com/u/' + post.author
                    },
                };

                // Check if post is video from imgur. gifv is proprietary so change the url to mp4
                if (mediaUrl.includes('imgur.com') && mediaUrl.substring(mediaUrl.length - 4) === 'gifv') {
                    mediaUrl = mediaUrl.substring(0, mediaUrl.length - 4) + 'mp4';
                    embed.description = mediaUrl;
                } else {
                    embed.image = {
                        url: mediaUrl
                    };
                }

                client.channels.resolve(CHANNEL_MEMES).send({
                    embed
                });

                // Only send video if it was an mp4
                if (mediaUrl.substring(mediaUrl.length - 3) === 'mp4') {
                    client.channels.resolve(CHANNEL_MEMES).send({
                        files: [mediaUrl]
                    });
                }

                break;
            }
        })
        .catch(console.error);
}

client.on('message', message => {
    if (!message.author.bot && message.channel.type.toLowerCase() === 'text') {
        
        let msg = message.content; msg = msg.toLowerCase();

        if (msg.startsWith('!phonetic ')) {
            let input = msg.substring(10, msg.length);
            let output = '';

            for (let i = 0; i < input.length; i++) {
                if (phonetics[input.charAt(i).toUpperCase()] !== undefined) {
                    output += phonetics[input.charAt(i).toUpperCase()] + ' ';
                } else if (input.charAt(i) == ' ') {
                    output = output.substring(0, output.length - 1) + '|';
                } else {
                    output =
                        output.substring(0, output.length - 1) +
                        input.charAt(i);
                }
            }

            message.channel.send(output);
        } 
        
        if (msg.startsWith('!event ')) {
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
                sent.react('✅');
                if (parsed.startDate && new Date(parsed.startDate) > new Date()) {
                    events[sent.embeds[0].timestamp] = [parsed.eventTitle];
                    scheduleEventJob(sent.embeds[0].timestamp);
                    updateJSON(events);
                }
            });
        }
    }
});

client.on('error', info => {
    console.log('Error event:\n' + info.message);
});

function updateJSON(events) {
    fs.writeFileSync(DB_PATH, JSON.stringify(events));
}

function removeItemOnce(arr, value) {
    var index = arr.indexOf(value);
    if (index > -1) {
        arr.splice(index, 1);
    }
    return arr;
}

client.on('messageReactionAdd', async (reaction, user) => {
    if(reaction.message.partial) {
        await reaction.message.fetch();
    }

    if (user.bot) {
        return;
    }
    
    const guild = client.guilds.resolve(reaction.message.guild.id);
    if ((reaction.emoji.name === 'upvote') && reaction.message.embeds.length != 0 && reaction.message.author.id === client.user.id) {
        client.channels
            .resolve(CHANNEL_GENERAL)
            .messages.fetch({ limit: 100 })
            .then(messages => {
                // Filter out mesages from the bot
                messages = messages.filter(
                    m => m.author.id === client.user.id
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
                reaction.message.embeds[0].footer = { text: guild.member(user).displayName + ' shared this meme' };

                // Finally send the meme
                client.channels.resolve(CHANNEL_GENERAL).send({ embed: reaction.message.embeds[0] });

                // Check if video was included in description. If so then send that too
                if (reaction.message.embeds[0].description != null && reaction.message.embeds[0].description != '') {
                    client.channels.resolve(CHANNEL_GENERAL).send({
                        files: [reaction.message.embeds[0].description]
                    });
                }
            });
    }

    if (reaction.emoji.name == '✅' && reaction.message.author.id === client.user.id && reaction.message.channel.id != CHANNEL_MEMES) {
        const embed = reaction.message.embeds[0];

        for (let i = 0; i < embed.fields.length; i++) {
            const field = embed.fields[i];
            if (field.value === guild.member(user).displayName) {
                return false;
            }
        }

        embed.fields.push(
            {
                name: 'Attendee',
                value: guild.member(user).displayName,
            },
        );

        reaction.message.edit(new Discord.MessageEmbed(embed)).then(_ => {
            if (embed.timestamp in events) {
                events[embed.timestamp].push(user.id);
                updateJSON(events);
            }
        });
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if(reaction.message.partial) {
        await reaction.message.fetch();
    }

    const guild = client.guilds.resolve(reaction.message.guild.id);
    if (reaction.emoji.name == '✅' && reaction.message.author.id === client.user.id && reaction.message.channel.id != CHANNEL_MEMES) {
        const embed = reaction.message.embeds[0];
        embed.fields = embed.fields.filter(field => field.value != guild.member(user).displayName);
        
        reaction.message.edit(new Discord.MessageEmbed(embed)).then(_ => {
            if (embed.timestamp in events) {
                events[embed.timestamp] = removeItemOnce(events[embed.timestamp], user.id);
                updateJSON(events);
            }
        });
    }
});

client.on('messageDelete', message => {
    client.channels.resolve(CHANNEL_LOGGING).send(message.author.username);
    client.channels.resolve(CHANNEL_LOGGING).send('Content: ' + message.content);
});

client.on('shardDisconnect', console.log);
client.login(process.env.BOT_TOKEN);
