import * as puppeteer from "puppeteer";
import { load } from "cheerio";
import { EmbedFieldData } from "discord.js";

export class GoogleSearchPlugin {
    public static async search(query: string) {
        const browser = await puppeteer.launch({ headless: true });

        const page = await browser.newPage();

        await page.goto(encodeURI('https://www.google.com/search?q=' + query));

        await page.waitForSelector('h3.LC20lb');

        const html = await page.content();
    
        let results: EmbedFieldData[] = [];
        const $ = load(html);
        $('h3.LC20lb').toArray().slice(0, 6).forEach(element => {
            results.push({name: $(element).text(), value: $(element.parent).attr('href')})
        });
    
        await browser.close();
        return results;
    }
}