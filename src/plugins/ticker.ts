import * as puppeteer from "puppeteer";

export class RobinHoodPlugin {
    public static async fetchTicker(query: string, timeLength: string) {
        const browser = await puppeteer.launch({ headless: true });

        const page = await browser.newPage();
        await page.goto(encodeURI('https://robinhood.com/stocks/' + query));
        await page.waitForSelector('._3ZzTswmGTiUT4AhIhKZfZh');

        const ticker = await page.$('._3ZzTswmGTiUT4AhIhKZfZh')

        const [selection] = (await page.$x(`//span[contains(text(), "${timeLength}")]/../..`));
        selection.click();

        const image = await ticker.screenshot();

        await browser.close();
        return image;
    }
}