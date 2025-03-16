import puppeteer, { Browser, Page } from "puppeteer";
import { AuthService } from "./auth";
import { Book, BookshelfResponse } from "../types/book";
import path from "path";
import fs from "fs";

export class BookscanService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private static readonly LOGIN_URL =
    "https://system.bookscan.co.jp/mypage/login.php";
  private static readonly BOOKSHELF_URL =
    "https://system.bookscan.co.jp/mypage/bookshelf_all_list.php?q=&sort=s";

  constructor(private authService: AuthService) {}

  public async initialize(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
    });
    this.page = await this.browser.newPage();

    // PDFダウンロード用のディレクトリを作成
    const downloadPath = path.join(process.cwd(), "downloads");
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath);
    }

    // PDFダウンロードの設定
    const client = await this.page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadPath,
    });
  }

  public async login(): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    const credentials = this.authService.getCredentials();

    await this.page.goto(BookscanService.LOGIN_URL);
    await this.page.waitForSelector('input[name="mail"]');
    await this.page.waitForSelector('input[name="password"]');

    await this.page.type('input[name="mail"]', credentials.userId);
    await this.page.type('input[name="password"]', credentials.password);

    await Promise.all([
      this.page.waitForNavigation(),
      this.page.click('input[type="submit"]'),
    ]);

    // ログイン後のURLをチェック
    const currentUrl = this.page.url();
    if (currentUrl.includes("login.php")) {
      throw new Error("Login failed. Please check your credentials.");
    }
  }

  public async getBookList(): Promise<BookshelfResponse> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    await this.page.goto(BookscanService.BOOKSHELF_URL);
    await this.page.waitForSelector(".book-list");

    const books = await this.page.evaluate(() => {
      const bookElements = document.querySelectorAll(".book-list .book-item");
      return Array.from(bookElements).map((element) => {
        const titleElement = element.querySelector(".book-title a");
        const title = titleElement?.textContent?.trim() || "";
        const url = titleElement?.getAttribute("href") || "";
        return { title, url };
      });
    });

    return {
      books,
      totalCount: books.length,
    };
  }

  public async downloadBook(book: Book): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    // 本の詳細ページに移動
    const bookUrl = new URL(book.url, BookscanService.BOOKSHELF_URL).href;
    await this.page.goto(bookUrl);

    // PDFダウンロードリンクを探して取得
    const downloadUrl = await this.page.evaluate(() => {
      const downloadLink = document.querySelector('a[href*="pdf"]');
      return downloadLink?.getAttribute("href") || null;
    });

    if (!downloadUrl) {
      throw new Error(`PDF download link not found for book: ${book.title}`);
    }

    // PDFをダウンロード
    await this.page.goto(downloadUrl);
    console.log(`Downloaded: ${book.title}`);
  }

  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
