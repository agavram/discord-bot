import Bot from './bot/bot';

let bot: Bot = new Bot();

bot.Ready.then(() => {
  console.log('Ready');
});
