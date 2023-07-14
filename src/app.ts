import * as mongoose from 'mongoose';
import Bot from './bot/bot';

const bot: Bot = new Bot();

bot.Ready.then(() => {
  console.log('Ready');
});

process.on('SIGINT', function() {
  mongoose.disconnect();
});


process.on('SIGTERM', function() {
  mongoose.disconnect();
});
