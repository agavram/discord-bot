import * as mongoose from 'mongoose';
import Bot from './bot/bot';

const bot: Bot = new Bot();

bot.Ready.then(() => {
  console.log('Ready');
});

['exit', 'SIGINT', 'SIGTERM'].forEach(
  e => process.on(e, () => {
    mongoose.disconnect();
  })
);
