import * as puppeteer from 'puppeteer';

export class RobinHoodPlugin {
  public static async fetchTicker(query: string, timeLength = '1D') {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 2 });
    await page.goto(encodeURI('https://www.tradingview.com/symbols/' + query));

    let image;
    try {
      await page.waitForSelector('.item-G1QqQDLk');

      const ticker = await page.$('.tv-feed-widget-chart__container');

      await page.waitForSelector('.item-G1QqQDLk');
      const [selection] = await page.$x(`//div[contains(@class, 'item-G1QqQDLk') and contains(., "${timeLength}")]`);
      await selection.click();
      await page.mouse.move(0, 0);
      await page.waitForSelector('.fade-nybNAiFo', { hidden: true });

      image = await ticker.screenshot();
    } catch (e) {
      console.error(e);
    }

    page.close();
    return image;
  }
}
