import { load } from 'cheerio';
import { EmbedFieldData } from 'discord.js';
import { PuppeteerBrowser } from './chrome';

export class GoogleSearchPlugin {
  public static async search(query: string) {
    const browser = await PuppeteerBrowser.getInstance();

    const page = await browser.newPage();

    await page.goto(encodeURI('https://www.google.com/search?q=' + query));

    await page.waitForSelector('h3.LC20lb');

    const html = await page.content();

    const results: EmbedFieldData[] = [];
    const $ = load(html);
    $('h3.LC20lb')
      .toArray()
      .slice(0, 6)
      .forEach((element) => {
        results.push({ name: $(element).text(), value: $(element.parent).attr('href') });
      });

    page.close();
    return results;
  }
}
