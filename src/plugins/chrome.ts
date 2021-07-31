import * as puppeteer from 'puppeteer';

export class PuppeteerBrowser {
  static browser: puppeteer.Browser;

  public static async getInstance() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({ headless: true });
    }
    return this.browser;
  }
}
