import * as dotenv from 'dotenv';
dotenv.config();

import { execSync } from 'child_process';
import { Client, Message, MessageEmbed, MessageReaction, User, Guild, AnyChannel } from 'discord.js';
require('discord-reply');
import { MongoClient, Collection } from 'mongodb';
import { EventEmitter } from 'events';
import { job } from 'cron';
import { Data2, Child } from '../interfaces/reddit';
import { server, event, user } from '../interfaces/database';
import { isProd } from '../helpers/functions';
import axios from 'axios';
import { phonetics } from '../helpers/phonetic-alphabet';
import { parse } from 'sherlockjs';
import { GoogleSearchPlugin } from '../plugins/google';
import { LatexConverter } from '../plugins/latex';
import { RobinHoodPlugin } from '../plugins/ticker';
import { AnimeDetector } from '../plugins/anime-detector';
import * as moment from 'moment';
import { orderBy } from 'lodash';

export default class Bot {
  public Ready: Promise<void>;

  static readonly PREMOVE_QUEUE_SIZE: number = 10;

  client: Client;
  mongoClient: MongoClient;
  animeDetector: AnimeDetector;

  eventsCollection: Collection;
  serversCollection: Collection;
  usersCollection: Collection;

  prefix = '!';
  events: Array<event> = [];

  dictionary: string[] = ['when', 'the', 'me'];
  premoves: Map<number, string[]> = new Map<number, string[]>();

  readonly redditColor = '#FF4500';

  constructor() {
    const command = new EventEmitter();
    const dm = new EventEmitter();
    const reaction = new EventEmitter();

    this.Ready = new Promise((resolve) => {
      this.client = new Client({
        partials: ['CHANNEL', 'MESSAGE', 'REACTION', 'GUILD_MEMBER', 'USER'],
        intents: [
          'GUILDS',
          'GUILD_MEMBERS',
          'GUILD_MESSAGES',
          'GUILD_MESSAGE_REACTIONS',
          'GUILD_INVITES',
          'GUILD_EMOJIS_AND_STICKERS',
          'GUILD_BANS',
          'DIRECT_MESSAGES',
          'DIRECT_MESSAGE_REACTIONS',
        ],
      });
      this.client.login(isProd() ? process.env.BOT_TOKEN : process.env.TEST_BOT_TOKEN), (this.animeDetector = new AnimeDetector());

      MongoClient.connect(process.env.MONGODB_URI)
        .then((client) => {
          this.mongoClient = client;
        })
        .then(() => {
          const dbName: string = process.env.DB_NAME;
          this.eventsCollection = this.mongoClient.db(dbName).collection('events');
          this.serversCollection = this.mongoClient.db(dbName).collection('servers');
          this.usersCollection = this.mongoClient.db(dbName).collection('users');

          this.eventsCollection.deleteMany({ time: { $lt: new Date() } }).then(() => {
            this.eventsCollection
              .find({})
              .toArray()
              .then((docs: unknown) => {
                this.events = docs as event[];
                this.events.forEach((event) => {
                  this.scheduleEventJob(event.time);
                });
              });
          });
          this.animeDetector.initialize();

          this.client.once('ready', () => {
            job(
              '0,30 * * * *',
              () => {
                this.serversCollection
                  .find({})
                  .toArray()
                  .then((servers: unknown) => this.sendMeme(servers as server[]));
              },
              null,
              true,
            );

            job(
              '0 0 * * *',
              () => {
                this.usersCollection.updateMany({}, { $set: { sentAttachments: 0 } });
              },
              null,
              true,
            );

            job(
              '0 10 * * *',
              () => {
                this.notifyMariners();
              },
              null,
              true,
              null,
              null,
              true,
            );

            resolve();
          });
        });
    });

    this.client.on('messageCreate', (message) => {
      if (message.author.bot) return;

      const msg = message.content;
      const msgLowerCase = msg.toLocaleLowerCase();

      // Brazil
      if (message.guild.id === '856029113747111946') {
        if (msgLowerCase.includes('texas')) {
          message.react('<:OMEGALUL:856976423101399081>');
        } else if (msgLowerCase.includes('houston') || msgLowerCase.includes('oakland')) {
          message.react('<:mariners:857120069821530142>');
        }
        if (msgLowerCase === 'when') {
          let reply = 'me when the ';
          const length: number = Math.round(Math.random() * 88);

          while (reply.length < length) {
            const index = Math.floor(Math.random() * this.dictionary.length);
            reply += this.dictionary[index] + ' ';
          }
          // @ts-expect-error lineReplyNoMention is imported from discord-reply
          message.lineReplyNoMention(reply);
        }
      }

      const id = parseInt(message.author.id);
      if (this.premoves.has(id)) {
        const reply: string = this.premoves.get(id).shift();
        // @ts-expect-error lineReplyNoMention is imported from discord-reply
        message.lineReplyNoMention(reply);
        if (!this.premoves.get(id).length) {
          this.premoves.delete(id);
        }
      }

      if (!msg.startsWith(this.prefix)) return;

      message.content = msg.split(' ').slice(1).join(' ');

      let emitter: EventEmitter;
      switch (message.channel.type) {
        case 'GUILD_TEXT':
        case 'GUILD_PUBLIC_THREAD':
        case 'GUILD_PRIVATE_THREAD':
          emitter = command;
          break;

        case 'DM':
          emitter = dm;
          break;
      }

      emitter.emit(msg.substring(this.prefix.length).split(' ')[0].toLowerCase(), message);
    });

    ['messageReactionAdd', 'messageReactionRemove'].forEach((e) => {
      this.client.on(e, async (messageReaction: MessageReaction, user: User) => {
        if (messageReaction.message.partial) await messageReaction.message.fetch();

        if (user.bot || messageReaction.message.author.id !== this.client.user.id || messageReaction.message.embeds.length == 0) return;

        const guild = this.client.guilds.resolve(messageReaction.message.guild.id);
        reaction.emit(messageReaction.emoji.name, messageReaction, user, guild, e);
      });
    });

    reaction.on('upvote', (reaction: MessageReaction, user: User, guild: Guild, event) => {
      const embed = reaction.message.embeds[0];
      if (event !== 'messageReactionAdd' || !embed.author) return;

      this.serversCollection.findOne({ server: reaction.message.guild.id }).then((s) => {
        const server = s as unknown as server;
        if (reaction.message.channel.id !== server.channelMemes) return;

        const tc = this.resolveAsTextOrFail(this.client.channels.resolve(server.channelGeneral));
        tc.messages.fetch({ limit: 100 }).then(async (messages) => {
          if (
            messages.find((msg) => {
              if (msg.embeds.length > 0) return msg.embeds[0].url === embed.url;
            })
          )
            return false;

          if (user.partial) await user.fetch();
          embed.footer = {
            text: guild.members.resolve(user).displayName + ' shared this meme',
          };

          tc.send({ embeds: [embed] }).then(() => {
            // Check if video was included in description. If so then send that too
            if (embed.description) tc.send({ files: [embed.description] });
          });
        });
      });
    });

    reaction.on('✅', (reaction: MessageReaction, user: User, guild: Guild, event: string) => {
      const embed = reaction.message.embeds[0];
      if (!embed.title || !embed.title.startsWith('​')) return;

      if (event === 'messageReactionAdd') embed.fields.push({ name: 'Attendee', value: guild.members.resolve(user).displayName, inline: false });
      else embed.fields = embed.fields.filter((field) => field.value !== guild.members.resolve(user).displayName);

      reaction.message.edit({ embeds: [embed] }).then(() => {
        const index = this.events.findIndex((e) => e.time.valueOf() === embed.timestamp);
        if (index < 0) return;

        event === 'messageReactionAdd'
          ? this.events[index].attendees.push(user.id)
          : (this.events[index].attendees = this.events[index].attendees.filter((a) => a != user.id));
        this.updateEvent(new Date(embed.timestamp), this.events[index].attendees);
      });
    });

    command.on('event', (message: Message) => {
      const parsed = parse(message.content);

      // Generate the embed to post to discord
      const embed = new MessageEmbed().setTitle('​' + parsed.eventTitle).setTimestamp(new Date(parsed.startDate).valueOf());

      message.channel.send({ embeds: [embed] }).then((sent) => {
        sent.react('✅');
        if (parsed.startDate && new Date(parsed.startDate) > new Date())
          this.newEvent({ title: parsed.eventTitle, time: parsed.startDate, attendees: [], messageId: sent.id, channelId: message.channel.id });
      });
    });

    command.on('help', (message: Message) => {
      message.channel.send('<https://github.com/agavram/Discord_Bot/blob/master/HELP.md>');
    });

    command.on('die', (message: Message) => {
      message.channel.send('ok you are dead');
    });

    command.on('latex', async (message: Message) => {
      message.content = message.content.replace(/`/g, '');
      message.channel.send({ files: [await LatexConverter.convert(message.content)] });
    });

    command.on('premove', (message: Message) => {
      const split = message.content.trim().split(' ');

      message.delete();

      if (split.length < 2) {
        message.channel.send('Syntax: {prefix}premove {userId} {message}');
        return;
      }

      const userId = parseInt(split[0].trim());
      if (isNaN(userId)) {
        message.channel.send('Syntax: {prefix}premove {userId} {message}');
        return;
      }

      const premove_message = split.splice(1).join(' ').trim();
      if (!this.premoves.has(userId)) {
        this.premoves.set(userId, []);
      }

      const q = this.premoves.get(userId);
      q.push(premove_message);
      if (q.length > Bot.PREMOVE_QUEUE_SIZE) {
        q.shift();
      }
    });

    command.on('isanime', async (message: Message) => {
      const urlMatch = /[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)?/gi;
      if (!message.content || !urlMatch.test(message.content)) {
        message.channel.send('Invalid URL');
        return;
      }

      const res = await this.animeDetector.predict(message.content);
      if (Array.isArray(res)) return message.channel.send('Unable to process image');
      const d = res.dataSync;

      if (d[0] < 0.1 && d[1] < 0.1) {
        message.channel.send('Unknown');
        return;
      }

      if (d[0] > d[1]) message.channel.send('Anime: ' + Math.round(d[0] * 100) + '% Confident');
      else message.channel.send('Not Anime: ' + Math.round(d[1] * 100) + '% Confident');
    });

    command.on('poll', (message: Message) => {
      let title: string;
      let choices = '';

      let split = message.content.split(':');
      if (split.length < 2) {
        message.channel.send('Poll must contain `:` to separate prompt and choices');
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
        message.channel.send('Poll must contain at least 1 choice');
        return;
      }

      // Creates poll contents, up to 10 choices
      const pollSize = Math.min(split.length, 10);
      for (let i = 0; i < pollSize - 1; i++) {
        choices += i + 1 + ': ' + split[i] + '\n';
      }

      choices += split.length + ': ' + split[pollSize - 1];

      // Embeds, sends, and reacts
      const embed = new MessageEmbed().setTitle(title).setDescription(choices);

      const emoteList = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'].splice(0, pollSize);

      message.channel.send({ embeds: [embed] }).then((sent) => {
        emoteList.forEach((emote) => {
          sent.react(emote);
        });
      });
    });

    command.on('purge', (message: Message) => {
      if (message.author.id !== '213720243057590274') return;

      const [first] = message.content.split(' ');
      const [userId] = first.match(/[0-9]+/);

      const tc = this.resolveAsTextOrFail(message.channel);
      let messagesToDelete;
      tc.messages
        .fetch({ limit: 100 })
        .then(async (messages) => {
          // messages = messages.filter(message => message.author.id === )
          let previous = undefined;
          messages.delete(messages.firstKey());
          messagesToDelete = messages.filter((message) => {
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
        })
        .then(() => {
          if (tc.type === 'GUILD_TEXT') tc.bulkDelete(messagesToDelete);
          message.delete();
        });
    });

    command.on('run', (message: Message) => {
      message.content = message.content.replace(/`/g, '');

      const lines = message.content.split('\n');

      const language = lines[0];

      // Remove language
      lines.shift();

      const source = lines.join('\n');

      axios
        .post('https://emkc.org/api/v1/piston/execute', {
          language,
          source,
        })
        .then((res) => {
          let output = res.data.output;
          output = output.split('\n').slice(0, 20).join('\n');
          const embed = new MessageEmbed().setTitle('Output:');
          embed.setDescription('```\n' + output + '\n```');
          message.channel.send({ embeds: [embed] });
        })
        .catch((error) => {
          message.channel.send(error.data.message);
        });
    });

    command.on('sendmeme', (message: Message) => {
      if (message.author.id === '213720243057590274') {
        this.serversCollection
          .find({})
          .toArray()
          .then((servers: unknown) => this.sendMeme(servers as server[]));
      }
    });

    command.on('version', (message: Message) => {
      const gitRevision = execSync('git rev-parse HEAD').toString().trim();
      const time = new Date(parseInt(execSync('git log -1 --format=%ct').toString()) * 1000).toLocaleString('en-US');
      message.channel.send(`\`${gitRevision}\` from ${time}`);
    });

    command.on('vote', (message: Message) => {
      const embed = new MessageEmbed().setTitle(message.content);

      message.channel.send({ embeds: [embed] }).then((sent) => {
        sent.react('✅');
        sent.react('❌');
      });
    });

    command.on('phonetic', (message: Message) => {
      const input = message.content.trim();
      let output = '';

      for (let i = 0; i < input.length; i++) {
        if (phonetics[input.charAt(i).toUpperCase()]) output += phonetics[input.charAt(i).toUpperCase()] + ' ';
        else if (input.charAt(i) == ' ') output = output.substring(0, output.length - 1) + '|';
        else output = output.substring(0, output.length - 1) + input.charAt(i);
      }

      message.channel.send(output);
    });

    command.on('ping', (message: Message) => {
      message.channel.send(this.client.ws.ping + ' ms');
    });

    command.on('search', async (message: Message) => {
      this.serversCollection.findOne({ server: message.guild.id }).then(async (server) => {
        if (server.channelGeneral === message.channel.id) {
          message.channel.send('no');
          return;
        }

        const results = await GoogleSearchPlugin.search(message.content);

        const embed = new MessageEmbed().addFields(results);
        message.channel.send({ embeds: [embed] });
      });
    });

    command.on('ticker', async (message: Message) => {
      const [query, timeLength] = message.content.split(' ');
      const image = await RobinHoodPlugin.fetchTicker(query, timeLength && timeLength.toUpperCase());
      if (image) {
        message.channel.send({ files: [image] });
      }
    });

    command.on('cum', (message: Message) => {
      const length: number = 1 + Math.round(Math.random() * 9);
      let ben = '8';
      for (let i = 0; i < length; i++) {
        ben += '=';
      }
      ben += 'D💦';
      message.channel.send(ben);
    });

    dm.on('channel', async (message: Message) => {
      const user: user = {
        userId: message.author.id,
        channelAnon: message.content,
      };

      this.usersCollection.updateOne({ userId: user.userId }, { $set: user }, { upsert: true }).then(() => {
        message.channel.send('Channel ID successfully set');
      });
    });
  }

  private newEvent(event: event) {
    this.eventsCollection.insertOne(event as unknown);
    this.events.push(event);
    this.scheduleEventJob(event.time);
  }

  private async notifyMariners() {
    const res = await axios.get('http://statsapi.mlb.com/api/v1/schedule/games/?sportId=1');
    if (!res.data?.dates || !res.data?.dates.length) {
      return;
    }
    const games = res.data?.dates[0].games;

    console.log('Currently: ' + new Date().toLocaleTimeString());

    for (const game of games ?? []) {
      if (game.teams.away.team.id === 136 || game.teams.home.team.id === 136) {
        const gameStart = new Date(game.gameDate);
        if (gameStart < new Date()) return;

        const notificationTime = new Date(gameStart.getTime() - 1000 * 60 * 10);
        // TODO: Remove this logging
        console.log('Notifying for game at: ' + notificationTime.toString());
        job(
          notificationTime,
          async () => {
            const servers = (await this.serversCollection.find({ channelMariners: { $exists: true } }).toArray()) as unknown as server[];
            if (!servers) throw new Error('Unable to fetch servers');

            servers.forEach((server) => {
              this.resolveAsTextOrFail(this.client.channels.resolve(server.channelMariners)).send(
                `${game.teams.away.team.name} @ ${game.teams.home.team.name} - ${moment(gameStart).format('h:mm A')}`,
              );
            });

            const highlightsPosted: string[] = [];

            const ping = setInterval(async () => {
              const status = (await axios.get(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${game.gamePk}&useLatestGames=true&language=en`)).data
                .dates[0].games[0].status;

              let updates = (await axios.get(`http://statsapi.mlb.com/api/v1/game/${game.gamePk}/content`)).data.highlights.highlights.items;
              updates = orderBy(updates, (update) => new Date(update.date), 'asc');

              for (let i = 0; i < updates.length; i++) {
                const update = updates[i];
                if (highlightsPosted.includes(update.id)) continue;

                try {
                  servers.forEach(async (server) => {
                    this.client.channels.resolve(server.channelMariners);
                    const channel = this.resolveAsTextOrFail(this.client.channels.resolve(server.channelMariners));
                    await channel.send(update.blurb);
                    await channel.send(update.playbacks[0].url);
                  });

                  highlightsPosted.push(update.id);
                } catch (error) {
                  console.error(error);
                  console.error('Could not send message');
                  console.error(update.blurb);
                  console.error(update.playbacks[0].url);
                }
              }

              if (status.abstractGameState === 'Final') clearInterval(ping);
            }, 1000 * 60);
          },
          null,
          true,
        );
      }
    }
  }

  private resolveAsTextOrFail(channel: AnyChannel) {
    if (channel.isText()) {
      return channel;
    } else {
      console.error(`${channel} did not resolve to a text or thread channel`);
    }
  }

  private updateEvent(time: Date, attendees: Array<string>) {
    this.eventsCollection.updateOne({ time: time }, { $set: { attendees } });
  }

  private async sendMeme(servers: Array<server>) {
    const res = await axios.get('https://www.reddit.com/r/dankmemes/hot.json');
    if (res.status >= 400) {
      servers.forEach((server) => {
        this.resolveAsTextOrFail(this.client.channels.resolve(server.channelMemes)).send('Reddit is down with status code: ' + res.status);
      });
      return;
    }

    const posts: Array<Child> = res.data.data.children;

    servers.forEach((server) => {
      for (let index = 0; index < posts.length; index++) {
        const post: Data2 = posts[index].data;
        if (server.posts.includes(post.id) || post.stickied || post.author === 'idea4granted') continue;

        // The list does not need to hold memes more than a day old
        if (server.posts.length > 48) server.posts.shift();

        server.posts.push(post.id);
        this.serversCollection.updateOne({ _id: server._id }, { $set: { posts: server.posts } });

        // Attempt to get an image
        let mediaUrl: string = post.url;

        // Generate the embed to post to discord
        const embed = new MessageEmbed()
          .setColor(this.redditColor)
          .setTitle(post.title)
          .setURL('https://www.reddit.com' + post.permalink)
          .setTimestamp(post.created_utc * 1000)
          .setAuthor({
            name: post.author,
            iconURL: 'https://cdn.discordapp.com/attachments/486983846815072256/734930339209805885/reddit-icon.png',
            url: 'https://www.reddit.com/u/' + post.author,
          });

        // Check if post is video from imgur. gifv is proprietary so change the url to mp4
        if (mediaUrl.includes('imgur.com') && mediaUrl.endsWith('gifv')) {
          mediaUrl = mediaUrl.substring(0, mediaUrl.length - 4) + 'mp4';
          embed.description = mediaUrl;
        } else embed.image = { url: mediaUrl };

        const tc = this.resolveAsTextOrFail(this.client.channels.resolve(server.channelMemes));
        tc.send({ embeds: [embed] }).then(() => {
          if (mediaUrl.endsWith('mp4')) tc.send({ files: [mediaUrl] });
        });

        break;
      }
    });
  }

  private scheduleEventJob(time: Date) {
    job(
      time,
      async () => {
        const event = this.events[this.events.findIndex((e) => e.time === time)];
        const channel = this.resolveAsTextOrFail(await this.client.channels.fetch(event.channelId));
        const message = await channel.messages.fetch(event.messageId);

        const mentions: string[] = [];
        event.attendees.forEach(async (attendee) => {
          mentions.push(`<@${attendee}>`);
        });

        // @ts-expect-error lineReplyNoMention is imported from discord-reply
        message.lineReplyNoMention(mentions.join(' '));
        this.eventsCollection.deleteOne({ time: time });
      },
      null,
      true,
    );
  }
}
