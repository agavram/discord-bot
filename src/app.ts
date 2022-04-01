import Bot from './bot/bot';

const bot: Bot = new Bot();

bot.Ready.then(() => {
  console.log('Ready');
});
