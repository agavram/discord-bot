import * as dotenv from "dotenv";
dotenv.config();

import { Client, Message, MessageEmbed, MessageReaction, User, TextChannel, Guild } from "discord.js";
import { MongoClient, Collection } from "mongodb";
import { EventEmitter } from "events";
import { scheduleJob } from "node-schedule";
import { Data2, Child } from "../interfaces/reddit";
import { server, event, user } from "../interfaces/database";
import { ifProd } from "../helpers/functions";
import axios from "axios";
import { phonetics } from "../helpers/phonetic-alphabet";
import { parse } from "sherlockjs";
import { GoogleSearchPlugin } from "../plugins/google";
import { LatexConverter } from "../plugins/latex";
import { RobinHoodPlugin } from "../plugins/ticker";

export default class Bot {
    public Ready: Promise<void>;

    client: Client;
    mongoClient: MongoClient;

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
            this.client.login(ifProd() ? process.env.BOT_TOKEN : process.env.TEST_BOT_TOKEN),

                MongoClient.connect(process.env.MONGODB_URI, { useUnifiedTopology: true }).then(client => {
                    this.mongoClient = client;
                }).then(_ => {
                    const dbName: string = ifProd() ? "discord_bot" : "discord_bot_testing";
                    this.eventsCollection = this.mongoClient.db(dbName).collection("events");
                    this.serversCollection = this.mongoClient.db(dbName).collection("servers");
                    this.usersCollection = this.mongoClient.db(dbName).collection("users");
                    Promise.allSettled([
                        this.eventsCollection.find({}).toArray().then((docs) => {
                            this.events = docs;
                        }),
                        this.eventsCollection.deleteMany({ "time": { "$lt": new Date() } }),
                    ]).then(() => {
                        this.client.once("ready", () => {
                            scheduleJob("0,30 * * * *", () => {
                                this.serversCollection.find({}).toArray().then(servers => this.sendMeme(servers));
                            });

                            scheduleJob("0 0 * * *", () => {
                                this.usersCollection.updateMany({}, { $set: { sentAttachments: 0 } });
                            });

                            resolve();
                        });
                    });
                });
        });

        this.client.on("message", message => {
            if (message.author.bot)
                return;

            let msg = message.content;

            if (msg.toLowerCase() === "sigh")
                message.channel.send("le sigh")

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

            emitter.emit(msg.substring(this.prefix.length).split(" ")[0], message);
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
                    this.newEvent(parsed.eventTitle, parsed.startDate);
            });
        });

        command.on("help", (message: Message) => {
            message.channel.send("<https://github.com/agavram/Discord_Bot/blob/master/HELP.md>");
        });

        command.on("die", (message: Message) => {
            message.channel.send("ok you are dead");
        });

        command.on("latex", async (message: Message) => {
            message.channel.send({ files: [await LatexConverter.convert(message.content)] });
        });

        command.on("poll", (message: Message) => {
            const found = message.content.match(/{(\d+)}(.*)/);

            let pollSize: number;
            let title: string;

            if (found == null) {
                pollSize = 10;
                title = message.content;
            } else {
                pollSize = parseInt(found[1]);
                title = found[2];
            }

            let embed = new MessageEmbed().setTitle(title);
            var emoteList = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            message.channel.send({ embed }).then(sent => {
                for (let i = 0; i < Math.min(pollSize, 10); i++) {
                    sent.react(emoteList[i]);
                }
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
                tc.bulkDelete(messagesToDelete)
                message.delete();
            });
        });

        command.on("sendmeme", (message: Message) => {
            if (message.author.id === "213720243057590274") {
                this.serversCollection.find({}).toArray().then(servers => this.sendMeme(servers));
            }
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
                message.channel.send({files: [image]})
            }
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

    private newEvent(title: string, time: Date) {
        const event: event = { title: title, time: time, attendees: [] };
        this.eventsCollection.insertOne(event);
        this.events.push(event);
        this.scheduleEventJob(time);
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
        scheduleJob(time, () => {
            const index = this.events.findIndex(e => e.time === time);

            this.events[index].attendees.forEach(attendee => {
                try {
                    this.client.users.resolve(attendee).send(this.events[index].title + " is happening right now");
                } catch (error) {
                    console.log("Failed to DM: " + attendee);
                }
            });

            this.eventsCollection.deleteOne({ "time": time });
        });
    }
}
