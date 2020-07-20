import Bot from "./bot/bot";

let bot: Bot = new Bot();

bot.Ready.then(_ => {
    console.log('Ready');
});
