import mongoose from 'mongoose';
import Bot from './bot/bot';

const bot: Bot = new Bot();

bot.Ready.then(() => {
  console.log('Ready', bot.client.user.tag);
});

['exit', 'SIGINT', 'SIGTERM'].forEach((e) =>
  process.on(e, async () => {
    mongoose.disconnect();
    console.log('Disconnecting...');
    await bot.client.destroy();
    console.log('Disconnected');
    process.exit(0);
  }),
);
