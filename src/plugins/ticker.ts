import * as puppeteer from "puppeteer";

export class RobinHoodPlugin {
    public static async fetchTicker(query: string, timeLength: string = "1D") {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setViewport({ width: 960, height: 540, deviceScaleFactor:2 })
        await page.goto(encodeURI('https://www.tradingview.com/symbols/' + query));

        let image;
        try {
            await page.waitForSelector('.js-feed__item.tv-feed-widget-chart.js-feed__item--inited ');

            const ticker = await page.$('.js-feed__item.tv-feed-widget-chart.js-feed__item--inited ')
    
            await page.waitForSelector('.item-3cgIlGYO');
            const [selection] = (await page.$x(`//div[contains(@class, 'item-3cgIlGYO') and contains(., "${timeLength}")]`));
            await selection.click();
            await new Promise(resolve => setTimeout(resolve, 50));
            await page.mouse.move(0, 0);
    
            image = await ticker.screenshot();
        } catch (e) {
            console.error(e);
        }

        page.close(); 
        return image;
    }
}