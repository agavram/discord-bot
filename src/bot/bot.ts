import * as dotenv from "dotenv";
dotenv.config();

import { Client, Message, MessageEmbed, MessageReaction, User, TextChannel, Guild } from "discord.js";
import { MongoClient, Collection } from 'mongodb';
import { EventEmitter } from "events";
import { scheduleJob } from "node-schedule";
import { Data2, Child } from "../interfaces/reddit";
import { server, event } from "../interfaces/database";
import { ifProd } from "../helpers/functions";
import axios from 'axios';
import { phonetics } from "../helpers/phonetic-alphabet";
import * as Sherlock from "sherlockjs";

export default class Bot {
    public Ready: Promise<any>;

    client: Client;

    mongoClient: MongoClient;
    eventsCollection: Collection;
    serversCollection: Collection;

    prefix: string = "!";
    events: Array<event> = [];

    constructor() {
        const command = new EventEmitter();
        const reaction = new EventEmitter();

        this.Ready = new Promise((resolve, reject) => {
            this.client = new Client({ partials: ['MESSAGE', 'REACTION'] });
            this.client.login(ifProd() ? process.env.BOT_TOKEN : process.env.TEST_BOT_TOKEN),

                MongoClient.connect(process.env.MONGODB_URI, { useUnifiedTopology: true }).then(client => {
                    this.mongoClient = client;
                }).then(_ => {

                    this.eventsCollection = this.mongoClient.db(ifProd() ? "discord_bot" : "discord_bot_testing").collection('events');
                    this.serversCollection = this.mongoClient.db(ifProd() ? "discord_bot" : "discord_bot_testing").collection('servers');

                    Promise.allSettled([

                        this.eventsCollection.find({}).toArray().then(docs => {
                            this.events = docs;
                        }),
                        this.eventsCollection.deleteMany({ "time": { "$lt": new Date() } }),

                    ]).then(_ => {

                        this.client.once('ready', () => {
                            scheduleJob('0,30 * * * *', () => { this.sendMeme(); });
                            resolve(undefined);
                        });

                    });

                });
        });

        this.client.on('messageDelete', message => {
            this.serversCollection.findOne({ "server": message.guild.id }).then(async (server: server) => {
                if (message.channel.id != server.channelLogging) {
                    const tc = this.client.channels.resolve(server.channelMemes) as TextChannel;

                    if (message.author.partial)
                        await message.author.fetch();

                    tc.send(message.author.username);
                    tc.send('Content: ' + message.content);
                }
            });
        });

        this.client.on('message', message => {
            if (message.author.bot || message.channel.type.toLowerCase() !== 'text')
                return;

            let msg = message.content;
            if (msg.startsWith(this.prefix)) {
                message.content = msg.split(' ').slice(1).join(' ');
                command.emit(msg.substring(this.prefix.length).split(" ")[0], message);
            }
        });

        ['messageReactionAdd', 'messageReactionRemove'].forEach(e => {
            //@ts-expect-error
            this.client.on(e, async (messageReaction: MessageReaction, user: User) => {
                if (messageReaction.message.partial)
                    await messageReaction.message.fetch();

                if (user.bot || messageReaction.message.author.id !== this.client.user.id || messageReaction.message.embeds.length == 0)
                    return;

                const guild = this.client.guilds.resolve(messageReaction.message.guild.id);
                reaction.emit(messageReaction.emoji.name, messageReaction, user, guild, e);
            });
        });

        reaction.on('upvote', (reaction: MessageReaction, user: User, guild: Guild, event) => {
            if (event !== 'messageReactionAdd') return;

            this.serversCollection.findOne({ "server": reaction.message.guild.id }).then((server: server) => {
                const tc = this.client.channels.resolve(server.channelGeneral) as TextChannel;
                tc.messages.fetch({ limit: 100 }).then((messages) => {
                    if (messages.find(msg => {
                        if (msg.embeds.length > 0)
                            return msg.embeds[0].url === reaction.message.embeds[0].url;
                    }))
                        return false;

                    reaction.message.embeds[0].setFooter(guild.member(user).displayName + ' shared this meme');

                    tc.send({ embed: reaction.message.embeds[0] }).then(_ => {
                        // Check if video was included in description. If so then send that too
                        if (reaction.message.embeds[0].description != null) {
                            tc.send({ files: [reaction.message.embeds[0].description] });
                        }
                    });
                });
            });
        });

        reaction.on('✅', (reaction: MessageReaction, user: User, guild: Guild, event: String) => {
            let embed = reaction.message.embeds[0];

            if (embed.color === 16728368) return;

            if (event === 'messageReactionAdd')
                embed.fields.push({ name: 'Attendee', value: guild.member(user).displayName, inline: false });
            else
                embed.fields = embed.fields.filter(field => field.value !== guild.member(user).displayName);

            reaction.message.edit(new MessageEmbed(embed)).then(_ => {
                const index = this.events.findIndex(e => e.time.valueOf() === embed.timestamp);
                if (index >= 0) {
                    event === 'messageReactionAdd' ? this.events[index].attendees.push(user.id) :
                        this.events[index].attendees = this.events[index].attendees.filter(a => a != user.id);
                    this.updateEvent(new Date(embed.timestamp), this.events[index].attendees);
                }
            });

        });

        command.on('event', (message: Message) => {
            const parsed = Sherlock.parse(message.content);

            // Generate the embed to post to discord
            let embed = { title: parsed.eventTitle, fields: [], timestamp: parsed.startDate };

            message.channel.send({ embed }).then(sent => {
                sent.react('✅');
                if (parsed.startDate && new Date(parsed.startDate) > new Date())
                    this.newEvent(parsed.eventTitle, parsed.startDate);
            });
        });

        command.on('phonetic', (message: Message) => {
            let input = message.content.trim();
            let output: string = "";

            for (let i = 0; i < input.length; i++) {
                if (phonetics[input.charAt(i).toUpperCase()]) {
                    output += phonetics[input.charAt(i).toUpperCase()] + ' ';
                } else if (input.charAt(i) == ' ') {
                    output = output.substring(0, output.length - 1) + '|';
                } else {
                    output = output.substring(0, output.length - 1) + input.charAt(i);
                }
            }

            message.channel.send(output);
        });

        command.on('ping', (message: Message) => {
            message.channel.send(this.client.ws.ping + " ms");
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

    private async sendMeme() {
        const servers: Array<server> = await this.serversCollection.find({}).toArray();

        let res = await axios.get('https://www.reddit.com/r/dankmemes/hot.json');
        if (res.status >= 400) {
            servers.forEach(server => {
                //@ts-ignore
                this.client.channels.resolve(server.channelMemes).send('Reddit is down with status code: ' + res.status);
            });
            return;
        }

        const posts: Array<Child> = res.data.data.children;

        servers.forEach(server => {
            for (let index = 0; index < posts.length; index++) {
                const post: Data2 = posts[index].data;
                if (server.posts.includes(post.id) || post.stickied || post.author === 'idea4granted')
                    continue;

                if (server.posts.length > 48)
                    server.posts.shift();

                server.posts.push(post.id);
                this.serversCollection.updateOne({ "_id": server._id }, { $set: { posts: server.posts } });

                // Attempt to get an image
                let mediaUrl: string = post.media == null ? post.url : post.media.oembed.thumbnail_url;

                // Generate the embed to post to discord
                let embed: any = {
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
                if (mediaUrl.includes('imgur.com') && mediaUrl.endsWith('gifv')) {
                    mediaUrl = mediaUrl.substring(0, mediaUrl.length - 4) + 'mp4';
                    embed.description = mediaUrl;
                } else
                    embed.image = { url: mediaUrl };

                const tc = this.client.channels.resolve(server.channelMemes) as TextChannel;
                tc.send({ embed: embed }).then(() => {
                    if (mediaUrl.endsWith('mp4')) this.client.channels.cache.get(server.channelMemes);
                    tc.send({ files: [mediaUrl] });
                });

                break;
            }
        });
    }

    private scheduleEventJob(time: Date) {
        scheduleJob(time, () => {
            const index = this.events.findIndex(e => e.time === time);
            const attendees = this.events[index].attendees;

            attendees.forEach(attendee => {
                this.client.users.resolve(attendee).send(this.events[index].title + ' is happening right now');
            });

            this.eventsCollection.deleteOne({ "time": time });
        });
    }
}