import axios from 'axios';
import { execSync } from 'child_process';
import { job } from 'cron';
import { AnyChannel, Client, Guild, Message, MessageEmbed, MessageReaction, User } from 'discord.js';
import * as dotenv from 'dotenv';
import { EventEmitter } from 'events';
import { filter, find, orderBy, some } from 'lodash';
import * as moment from 'moment';
import * as mongoose from 'mongoose';
import { isProd } from '../helpers/functions';
import { phonetics } from '../helpers/phonetic-alphabet';
import { game, premove, server, user } from '../interfaces/database';
import { Game, GameSchedule } from '../interfaces/game-schedule';
import { GameStatus } from '../interfaces/game-status';
import { GameUpdates } from '../interfaces/game-updates';
import { Child, Data2 } from '../interfaces/reddit';
import { AnimeDetector } from '../plugins/anime-detector';
import { GoogleSearchPlugin } from '../plugins/google';
import { LatexConverter } from '../plugins/latex';
import { RobinHoodPlugin } from '../plugins/ticker';
dotenv.config();

export default class Bot {
  public Ready: Promise<void>;

  static readonly PREMOVE_QUEUE_SIZE: number = 10;

  client: Client;
  animeDetector: AnimeDetector;

  servers: mongoose.Model<server>;
  users: mongoose.Model<user>;
  gameHighlights: mongoose.Model<game>;
  premoves: mongoose.Model<premove>;

  ps: (mongoose.Document<unknown, unknown, premove> &
    premove & {
      _id: mongoose.Types.ObjectId;
    })[];

  prefix = '!';

  dictionary: string[] = ['when', 'the', 'me'];

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

      mongoose.connect(process.env.MONGODB_URI).then(() => {
        this.servers = mongoose.model(
          'servers',
          new mongoose.Schema<server>({
            server: { type: String, required: true },
            channelGeneral: { type: String, required: true },
            channelMemes: { type: String, required: true },
            channelLogging: { type: String, required: true },
            channelMariners: { type: String },
            posts: { type: [String], required: true },
          }),
        );

        this.users = mongoose.model(
          'users',
          new mongoose.Schema<user>({
            userId: { type: String, required: true },
            sentAttachments: { type: Number, required: true },
          }),
        );

        this.gameHighlights = mongoose.model(
          'gameHighlights',
          new mongoose.Schema<game>({
            highlightId: { type: String, required: true },
            gameId: { type: Number, required: true },
            gameStart: { type: Date, required: true },
          }),
        );

        this.premoves = mongoose.model(
          'premoves',
          new mongoose.Schema<premove>({
            targetUser: { type: String, required: true },
            moves: { type: [String], required: true },
          }),
        );

        this.animeDetector.initialize();

        this.client.once('ready', () => {
          job(
            '0,30 * * * *',
            () => {
              this.servers.find().then((servers) => this.sendMeme(servers));
            },
            null,
            true,
          );

          job(
            '0 0 * * *',
            () => {
              this.users.updateMany({}, { $set: { sentAttachments: 0 } });
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

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      const msg = message.content;

      // BRAZIL
      (() => {
        const msgLowerCase = msg.toLowerCase();
        if (message.guild.id !== '856029113747111946') return;
        if (msgLowerCase.includes('texas')) message.react('<:OMEGALUL:856976423101399081>');
        else if (msgLowerCase.includes('houston') || msgLowerCase.includes('oakland')) {
          message.react('<:mariners:857120069821530142>');
        }

        if (msgLowerCase !== 'when') return;
        let content = 'me when the ';
        const length: number = Math.round(Math.random() * 88);

        while (content.length < length) {
          const index = Math.floor(Math.random() * this.dictionary.length);
          content += this.dictionary[index] + ' ';
        }
        message.reply({ allowedMentions: { repliedUser: false }, content });
      })();

      // PREMOVE
      await (async () => {
        if (!this.ps) this.ps = await this.premoves.find();
        const p = find(this.ps, (p) => p.targetUser === message.author.id);
        if (!p) return;

        const content: string = p.moves.shift();
        message.reply({ allowedMentions: { repliedUser: false }, content });
        if (!p.moves.length) {
          await p.delete();
          this.ps = filter(this.ps, (m) => m._id != p._id);
        }
      })();

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

      this.servers.findOne({ server: reaction.message.guild.id }).then((server) => {
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

    command.on('premove', async (message: Message) => {
      const [id, ...msg] = message.content.trim().split(' ');

      message.delete();
      if (!id || !msg || !msg.length) return message.channel.send('Syntax: {prefix}premove {userId} {message}');
      const m = await message.guild.members.resolve(id);
      if (!m || m.user.bot) return message.channel.send('Invalid user id');

      const content = msg.join(' ').trim();
      this.ps = await this.premoves.find();
      let p = find(this.ps, (p) => p.targetUser === id);
      if (!p) {
        p = await this.premoves.create({
          targetUser: id,
          moves: [],
        });
        this.ps.push(p);
      }

      p.moves.push(content);
      if (p.moves.length > Bot.PREMOVE_QUEUE_SIZE) p.moves.shift();
      await p.save();
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
      if (!title.length) title = 'Untitled';

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
      if (message.author.id === '213720243057590274') this.servers.find().then((servers) => this.sendMeme(servers));
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

      for (const c of input) {
        if (phonetics[c.toUpperCase()]) output += phonetics[c.toUpperCase()] + ' ';
        else if (c == ' ') output = output.substring(0, output.length - 1) + '|';
        else output = output.substring(0, output.length - 1) + c;
      }

      message.channel.send(output);
    });

    command.on('ping', (message: Message) => {
      message.channel.send(this.client.ws.ping + ' ms');
    });

    command.on('search', async (message: Message) => {
      this.servers.findOne({ server: message.guild.id }).then(async (server) => {
        if (server.channelGeneral === message.channel.id) {
          return message.channel.send('no');
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
  }

  private async notifyMariners() {
    const schedule: GameSchedule = (await axios.get('http://statsapi.mlb.com/api/v1/schedule/games/?sportId=1')).data;
    if (!schedule.dates || !schedule.dates.length) return;
    const games = schedule.dates[0].games;

    for (const game of games ?? []) {
      if (game.teams.away.team.id === 136 || game.teams.home.team.id === 136) {
        const gameStart = new Date(game.gameDate);
        if (gameStart < new Date()) {
          return this.postHighlightsForGame(game);
        }

        const notificationTime = new Date(gameStart.getTime() - 1000 * 60 * 10);
        console.log('Notifying for game at: ' + notificationTime.toString());
        job(
          notificationTime,
          () => {
            this.postHighlightsForGame(game);
          },
          null,
          true,
        );
      }
    }
  }

  private async postHighlightsForGame(game: Game) {
    const servers = await this.servers.find({ channelMariners: { $exists: true } });
    await this.gameHighlights.deleteMany({ gameId: { $ne: game.gamePk } });
    if (!servers) throw new Error('Unable to fetch servers');

    const isGameOver = async (gamePk: number) => {
      const gamesStatus: GameStatus = (await axios.get(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${gamePk}&useLatestGames=true&language=en`))
        .data;
      const gameData = gamesStatus.dates[0].games[0];
      if (gameData.status.abstractGameState === 'Final') return gameData;
      return false;
    };

    const sendMissingUpdates = async () => {
      const gameUpdates: GameUpdates = (await axios.get(`http://statsapi.mlb.com/api/v1/game/${game.gamePk}/content`)).data;
      let highlights = gameUpdates.highlights.highlights.items;
      highlights = orderBy(highlights, (update) => new Date(update.date), 'asc');

      const highlightsPosted = await this.gameHighlights.find({ gameId: game.gamePk });
      for (const update of highlights) {
        if (some(highlightsPosted, (h) => h.highlightId === update.id)) continue;

        await this.gameHighlights.create({
          gameId: game.gamePk,
          gameStart: game.gameDate,
          highlightId: update.id,
        });

        servers.forEach(async (server) => {
          this.client.channels.resolve(server.channelMariners);
          const channel = this.resolveAsTextOrFail(this.client.channels.resolve(server.channelMariners));
          await channel.send(update.blurb + '\n' + update.playbacks[0].url);
        });
      }

      const gameData = await isGameOver(game.gamePk);
      if (gameData) {
        clearInterval(ping);
        if (some(highlightsPosted, (h) => h.highlightId === 'end')) return;
        servers.forEach(async (server) => {
          const c = this.resolveAsTextOrFail(this.client.channels.resolve(server.channelMariners));
          const t = gameData.teams;
          await c.send(`${t.home.team.name} ${t.home.score} - ${t.away.team.name} ${t.away.score}`);
        });
        await this.gameHighlights.create({
          gameId: game.gamePk,
          gameStart: game.gameDate,
          highlightId: 'end',
        });
      }
    };

    const ping = setInterval(sendMissingUpdates, 1000 * 60);
    if (await this.gameHighlights.countDocuments({ highlightId: 'start' })) return;
    servers.forEach((server) => {
      this.resolveAsTextOrFail(this.client.channels.resolve(server.channelMariners)).send(
        `${game.teams.away.team.name} @ ${game.teams.home.team.name} - ${moment(game.gameDate).format('h:mm A')}`,
      );
    });
    await this.gameHighlights.create({
      gameId: game.gamePk,
      gameStart: game.gameDate,
      highlightId: 'start',
    });
  }

  private resolveAsTextOrFail(channel: AnyChannel) {
    if (channel.isText()) return channel;
    else console.error(`${channel} did not resolve to a text or thread channel`);
  }

  private async sendMeme(
    servers: (mongoose.Document<unknown, unknown, server> &
      server & {
        _id: mongoose.Types.ObjectId;
      })[],
  ) {
    const res = await axios.get('https://www.reddit.com/r/whenthe/hot.json');
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
        server.save();

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
}
