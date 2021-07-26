import * as dotenv from "dotenv";
dotenv.config();

import { execSync } from "child_process";
import { Client, Message, MessageEmbed, MessageReaction, User, TextChannel, Guild } from "discord.js";
require('discord-reply');
import { MongoClient, Collection } from "mongodb";
import { EventEmitter } from "events";
import { job } from "cron";
import { Data2, Child } from "../interfaces/reddit";
import { server, event, user } from "../interfaces/database";
import { isProd } from "../helpers/functions";
import axios from "axios";
import { phonetics } from "../helpers/phonetic-alphabet";
import { parse } from "sherlockjs";
import { GoogleSearchPlugin } from "../plugins/google";
import { LatexConverter } from "../plugins/latex";
import { RobinHoodPlugin } from "../plugins/ticker";
import { AnimeDetector } from "../plugins/anime-detector";
import * as moment from 'moment';
import { orderBy } from 'lodash';

export default class Bot {
    public Ready: Promise<void>;

    client: Client;
    mongoClient: MongoClient;
    animeDetector: AnimeDetector;

    eventsCollection: Collection;
    serversCollection: Collection;
    usersCollection: Collection;

    prefix: string = "!";
    events: Array<event> = [];

    readonly redditColor: string = "#FF4500";

    constructor() {
        const command = new EventEmitter();
        const dm = new EventEmitter();
        const reaction = new EventEmitter();

        this.Ready = new Promise((resolve, reject) => {
            this.client = new Client({ partials: ["MESSAGE", "REACTION"] });
            this.client.login(isProd() ? process.env.BOT_TOKEN : process.env.TEST_BOT_TOKEN),
                this.animeDetector = new AnimeDetector();

            MongoClient.connect(process.env.MONGODB_URI, { useUnifiedTopology: true }).then(client => {
                this.mongoClient = client;
            }).then(_ => {
                const dbName: string = isProd() ? "discord_bot" : "discord_bot_testing";
                this.eventsCollection = this.mongoClient.db(dbName).collection("events");
                this.serversCollection = this.mongoClient.db(dbName).collection("servers");
                this.usersCollection = this.mongoClient.db(dbName).collection("users");
                Promise.allSettled([
                    this.eventsCollection.find({}).toArray().then((docs) => {
                        this.events = docs;
                    }),
                    this.eventsCollection.deleteMany({ "time": { "$lt": new Date() } }),
                    this.animeDetector.initialize()
                ]).then(() => {
                    this.client.once("ready", () => {
                        job("0,30 * * * *", () => {
                            this.serversCollection.find({}).toArray().then(servers => this.sendMeme(servers));
                        }, null, true);

                        job("0 0 * * *", () => {
                            this.usersCollection.updateMany({}, { $set: { sentAttachments: 0 } });
                        }, null, true);

                        job("0 3 * * *", () => { this.notifyMariners() }, null, true, null, null, true);

                        resolve();
                    });
                });
            });
        });

        this.client.on("message", message => {
            if (message.author.bot)
                return;

            let msg = message.content;

            if (!msg.startsWith(this.prefix))
                return;

            message.content = msg.split(" ").slice(1).join(" ");

            let emitter: EventEmitter;
            switch (message.channel.type.toLowerCase()) {
                case "text":
                    emitter = command;
                    break;

                case "dm":
                    emitter = dm;
                    break;
            }

            emitter.emit(msg.substring(this.prefix.length).split(" ")[0].toLowerCase(), message);
        });

        ["messageReactionAdd", "messageReactionRemove"].forEach((e) => {
            this.client.on(e, async (messageReaction: MessageReaction, user: User) => {
                if (messageReaction.message.partial)
                    await messageReaction.message.fetch();

                if (user.bot || messageReaction.message.author.id !== this.client.user.id || messageReaction.message.embeds.length == 0)
                    return;

                const guild = this.client.guilds.resolve(messageReaction.message.guild.id);
                reaction.emit(messageReaction.emoji.name, messageReaction, user, guild, e);
            });
        });

        reaction.on("upvote", (reaction: MessageReaction, user: User, guild: Guild, event) => {
            let embed = reaction.message.embeds[0];
            if (event !== "messageReactionAdd" || !embed.author) return;

            this.serversCollection.findOne({ "server": reaction.message.guild.id }).then((server: server) => {
                if (reaction.message.channel.id !== server.channelMemes)
                    return;

                const tc = this.client.channels.resolve(server.channelGeneral) as TextChannel;
                tc.messages.fetch({ limit: 100 }).then(async (messages) => {
                    if (messages.find(msg => {
                        if (msg.embeds.length > 0)
                            return msg.embeds[0].url === embed.url;
                    }))
                        return false;

                    if (user.partial)
                        await user.fetch();
                    embed.setFooter(guild.member(user).displayName + " shared this meme");

                    tc.send({ embed }).then(() => {
                        // Check if video was included in description. If so then send that too
                        if (embed.description)
                            tc.send({ files: [embed.description] });
                    });
                });
            });
        });

        reaction.on("✅", (reaction: MessageReaction, user: User, guild: Guild, event: String) => {
            let embed = reaction.message.embeds[0];
            if (!embed.title || !embed.title.startsWith("​")) return;

            if (event === "messageReactionAdd")
                embed.fields.push({ name: "Attendee", value: guild.member(user).displayName, inline: false });
            else
                embed.fields = embed.fields.filter(field => field.value !== guild.member(user).displayName);

            reaction.message.edit(new MessageEmbed(embed)).then(_ => {
                const index = this.events.findIndex(e => e.time.valueOf() === embed.timestamp);
                if (index < 0) return;

                event === "messageReactionAdd" ? this.events[index].attendees.push(user.id) :
                    this.events[index].attendees = this.events[index].attendees.filter(a => a != user.id);
                this.updateEvent(new Date(embed.timestamp), this.events[index].attendees);
            });
        });

        command.on("event", (message: Message) => {
            const parsed = parse(message.content);

            // Generate the embed to post to discord
            let embed = new MessageEmbed()
                .setTitle("​" + parsed.eventTitle)
                .setTimestamp(new Date(parsed.startDate).valueOf());

            message.channel.send({ embed }).then(sent => {
                sent.react("✅");
                if (parsed.startDate && new Date(parsed.startDate) > new Date())
                    this.newEvent({title: parsed.eventTitle, time: parsed.startDate, attendees: [], messageId: sent.id, channelId: message.channel.id});
            });
        });

        command.on("help", (message: Message) => {
            message.channel.send("<https://github.com/agavram/Discord_Bot/blob/master/HELP.md>");
        });

        command.on("die", (message: Message) => {
            message.channel.send("ok you are dead");
        });

        command.on("latex", async (message: Message) => {
            message.content = message.content.replace(/`/g, "");
            message.channel.send({ files: [await LatexConverter.convert(message.content)] });
        });

        command.on("isanime", async (message: Message) => {
            const urlMatch = /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)?/gi;
            if (!message.content || !(new RegExp(urlMatch).test(message.content))) {
                message.channel.send("Invalid URL");
                return;
            }

            let res: any = await this.animeDetector.predict(message.content);
            res = res.dataSync();

            if (res[0] < 0.1 && res[1] < 0.1) {
                message.channel.send("Unknown");
                return;
            }

            if (res[0] > res[1])
                message.channel.send("Anime: " + Math.round((res[0] * 100)) + "% Confident");
            else
                message.channel.send("Not Anime: " + Math.round((res[1] * 100)) + "% Confident");
        });

        command.on("poll", (message: Message) => {
            let pollSize: number;
            let title: string;
            let choices: string = "";

            let split = message.content.split(':');
            if (split.length < 2) {
                message.channel.send("Poll must contain `:` to separate prompt and choices");
                return;
            }

            // Title
            title = split[0].trim();
            if (!title.length) {
                title = 'Untitled';
            }

            // Checks for valid choices
            split = split[1].split(',');
            for (let i = 0; i < split.length; i++) {
                split[i] = split[i].trim();

                if (split[i].length == 0) {
                    split.splice(i, 1);
                    i--;
                }
            }

            if (!split.length) {
                message.channel.send("Poll must contain at least 1 choice");
                return;
            }

            // Creates poll contents, up to 10 choices
            pollSize = Math.min(split.length, 10);
            for (let i = 0; i < pollSize - 1; i++) {
                choices += (i + 1) + ': ' + split[i] + '\n';
            }

            choices += split.length + ': ' + split[pollSize - 1];

            // Embeds, sends, and reacts
            let embed = new MessageEmbed()
                .setTitle(title)
                .setDescription(choices);

            var emoteList = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
                .splice(0, pollSize);

            message.channel.send({ embed }).then(sent => {
                emoteList.forEach(emote => {
                    sent.react(emote);
                });
            });
        });

        command.on("purge", (message: Message) => {
            if (message.author.id !== "213720243057590274")
                return;

            const [first, second] = message.content.split(" ");
            let [userId] = first.match(/[0-9]+/);

            const tc = message.channel as TextChannel;
            let messagesToDelete;
            tc.messages.fetch({ limit: 100 }).then(async (messages) => {
                // messages = messages.filter(message => message.author.id === )
                let previous = undefined;
                messages.delete(messages.firstKey());
                messagesToDelete = messages.filter(message => {
                    if (message.author.id !== userId && previous != undefined) {
                        previous = false;
                    }
                    if (previous != undefined && !previous) {
                        return false;
                    }
                    if (message.author.id === userId) {
                        previous = true;
                        return true;
                    }
                    return false;
                });
            }).then(() => {
                tc.bulkDelete(messagesToDelete);
                message.delete();
            });
        });

        command.on("run", (message: Message) => {
            message.content = message.content.replace(/`/g, "");

            let lines = message.content.split("\n");

            let language = lines[0];

            // Remove language
            lines.shift();

            let source = lines.join("\n");

            axios.post('https://emkc.org/api/v1/piston/execute',
                {
                    language,
                    source
                })
                .then(res => {
                    let output = res.data.output;
                    output = output.split("\n").slice(0, 20).join("\n");
                    let embed = new MessageEmbed().setTitle("Output:");
                    embed.setDescription("```\n" + output + "\n```");
                    message.channel.send(embed);
                })
                .catch(error => {
                    message.channel.send(error.data.message);
                });
        });


        command.on("sendmeme", (message: Message) => {
            if (message.author.id === "213720243057590274") {
                this.serversCollection.find({}).toArray().then(servers => this.sendMeme(servers));
            }
        });

        command.on("version", (message: Message) => {
            let gitRevision = execSync("git rev-parse HEAD").toString().trim();
            let time = new Date(parseInt(execSync("git log -1 --format=%ct").toString()) * 1000).toLocaleString("en-US");
            message.channel.send(`\`${gitRevision}\` from ${time}`);
        });

        command.on("vote", (message: Message) => {
            let embed = new MessageEmbed().setTitle(message.content);

            message.channel.send({ embed }).then(sent => {
                sent.react("✅");
                sent.react("❌");
            });
        });

        command.on("phonetic", (message: Message) => {
            let input = message.content.trim();
            let output: string = "";

            for (let i = 0; i < input.length; i++) {
                if (phonetics[input.charAt(i).toUpperCase()])
                    output += phonetics[input.charAt(i).toUpperCase()] + " ";
                else if (input.charAt(i) == " ")
                    output = output.substring(0, output.length - 1) + "|";
                else
                    output = output.substring(0, output.length - 1) + input.charAt(i);
            }

            message.channel.send(output);
        });

        command.on("ping", (message: Message) => {
            message.channel.send(this.client.ws.ping + " ms");
        });

        command.on("search", async (message: Message) => {
            this.serversCollection.findOne({ "server": message.guild.id }).then(async (server: server) => {
                if (server.channelGeneral === message.channel.id) {
                    message.channel.send("no");
                    return;
                }

                const results = await GoogleSearchPlugin.search(message.content);

                let embed = new MessageEmbed().addFields(results);
                message.channel.send({ embed });
            });
        });

        command.on("ticker", async (message: Message) => {
            const [query, timeLength] = message.content.split(" ");
            const image = await RobinHoodPlugin.fetchTicker(query, timeLength && timeLength.toUpperCase());
            if (image) {
                message.channel.send({ files: [image] });
            }
        });

        command.on("transferemotes", (message: Message) => {
            const emoteManager = message.guild.emojis;
            const currentEmotes = emoteManager.cache.map(emote => emote.name);
            this.client.guilds.fetch(message.content)
                .then(function (guild) {
                    const emoteList = guild.emojis.cache.map(emote => emote.name + "=https://cdn.discordapp.com/emojis/" + emote.id + ".png");
                    for (let i = 0; i < emoteList.length; i++) {
                        let emote = emoteList[i].split("=");
                        if (emote.length == 2 && !currentEmotes.includes(emote[0])) {
                            emoteManager.create(emote[1], emote[0]);
                        }
                    }
                })
                .catch(console.error);
        });

        command.on("cum", (message: Message) => {
            message.channel.send("8===D 💦");
        });

        dm.on("channel", async (message: Message) => {
            const user: user = {
                userId: message.author.id,
                channelAnon: message.content
            };

            this.usersCollection.updateOne({ userId: user.userId }, { $set: user }, { upsert: true }).then(_ => {
                message.channel.send("Channel ID successfully set");
            });
        });
    }

    private newEvent(event: event) {
        this.eventsCollection.insertOne(event);
        this.events.push(event);
        this.scheduleEventJob(event.time);
    }

    private async notifyMariners() {
        const res = await axios.get('http://statsapi.mlb.com/api/v1/schedule/games/?sportId=1');
        const games = res.data?.dates[0].games;

        for (const game of games ?? []) {
          if (game.teams.away.team.id === 136 || game.teams.home.team.id === 136) {
            const gameStart = new Date(game.gameDate);
            if (gameStart < new Date())
                return

            const notificationTime = new Date(gameStart.getTime() - 1000 * 60 * 10)
            // TODO: Remove this logging
            console.log('Notifying for game at: ' + notificationTime.toString());
            job(
              notificationTime,
              async () => {
                this.serversCollection
                  .find({ channelMariners: { $exists: true } })
                  .toArray()
                  .then((servers: server[]) => {
                    servers.forEach((server) => {
                      this.client.channels
                        .resolve(server.channelMariners)
                        //@ts-ignore
                        .send(`${game.teams.away.team.name} @ ${game.teams.home.team.name} - ${moment(gameStart).format('h:mm A')}`);

                      const highlightsPosted: string[] = [];

                      // TODO: Move this out of servers collection
                      const ping = setInterval(async () => {
                        const status = (
                          await axios.get(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${game.gamePk}&useLatestGames=true&language=en`)
                        ).data.dates[0].games[0].status;

                        let updates = (await axios.get(`http://statsapi.mlb.com/api/v1/game/${game.gamePk}/content`)).data.highlights.highlights.items;
                        updates = orderBy(updates, (update) => new Date(update.date), 'asc')

                        for (let i = 0; i < updates.length; i++) {
                          const update = updates[i];
                          if (highlightsPosted.includes(update.id)) continue;

                          const channel = this.client.channels.resolve(server.channelMariners) as TextChannel;
                          await channel.send(update.blurb);
                          await channel.send(update.playbacks[0].url);

                          highlightsPosted.push(update.id);
                        }

                        if (status.abstractGameState === 'Final') clearInterval(ping);
                      }, 1000 * 60);
                    });
                  });
              },
              null,
              true,
            );
          }
        }
    }

    private updateEvent(time: Date, attendees: Array<string>) {
        this.eventsCollection.updateOne({ "time": time }, { $set: { attendees } });
    }

    private async sendMeme(servers: Array<server>) {
        let res = await axios.get("https://www.reddit.com/r/dankmemes/hot.json");
        if (res.status >= 400) {
            servers.forEach(server => {
                //@ts-ignore
                this.client.channels.resolve(server.channelMemes).send("Reddit is down with status code: " + res.status);
            });
            return;
        }

        const posts: Array<Child> = res.data.data.children;

        servers.forEach(server => {
            for (let index = 0; index < posts.length; index++) {
                const post: Data2 = posts[index].data;
                if (server.posts.includes(post.id) || post.stickied || post.author === "idea4granted")
                    continue;

                // The list does not need to hold memes more than a day old
                if (server.posts.length > 48)
                    server.posts.shift();

                server.posts.push(post.id);
                this.serversCollection.updateOne({ "_id": server._id }, { $set: { posts: server.posts } });

                // Attempt to get an image
                let mediaUrl: string = post.url;

                // Generate the embed to post to discord
                let embed = new MessageEmbed()
                    .setColor(this.redditColor)
                    .setTitle(post.title)
                    .setURL("https://www.reddit.com" + post.permalink)
                    .setTimestamp(post.created_utc * 1000)
                    .setAuthor(post.author, "https://cdn.discordapp.com/attachments/486983846815072256/734930339209805885/reddit-icon.png", "https://www.reddit.com/u/" + post.author);

                // Check if post is video from imgur. gifv is proprietary so change the url to mp4
                if (mediaUrl.includes("imgur.com") && mediaUrl.endsWith("gifv")) {
                    mediaUrl = mediaUrl.substring(0, mediaUrl.length - 4) + "mp4";
                    embed.description = mediaUrl;
                } else
                    embed.image = { url: mediaUrl };

                const tc = this.client.channels.resolve(server.channelMemes) as TextChannel;
                tc.send({ embed: embed }).then(() => {
                    if (mediaUrl.endsWith("mp4"))
                        tc.send({ files: [mediaUrl] });
                });

                break;
            }
        });
    }

    private scheduleEventJob(time: Date) {
        job(time, async () => {
            const event = this.events[this.events.findIndex(e => e.time === time)]
            const channel = await this.client.channels.fetch(event.channelId) as TextChannel
            const message = await channel.messages.resolve(event.messageId)
            

            let mentions: string[] = []
            event.attendees.forEach(async attendee => {
                mentions.push(`<@${attendee}>`)
            });

            // @ts-ignore
            message.lineReplyNoMention(mentions.join(' '))
            this.eventsCollection.deleteOne({ 'time' : time });
        }, null, true);
    }
}
