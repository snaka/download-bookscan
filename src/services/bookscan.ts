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
  private static readonly BASE_URL = "https://system.bookscan.co.jp";

  constructor(private authService: AuthService) {}

  public async initialize(): Promise<void> {
    console.log("Initializing browser...");
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    console.log("Browser launched");

    this.page = await this.browser.newPage();
    console.log("New page created");

    // デバッグ用のコンソールログを設定
    this.page.on("console", (msg) =>
      console.log("Browser console:", msg.text())
    );
    this.page.on("pageerror", (err) => console.error("Browser error:", err));

    // PDFダウンロード用のディレクトリを作成
    const downloadPath = path.join(process.cwd(), "downloads");
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath);
      console.log("Created downloads directory:", downloadPath);
    }

    // PDFダウンロードの設定
    console.log("Configuring PDF download settings...");
    const client = await this.page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadPath,
    });
    console.log("PDF download settings configured");
  }

  public async login(): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    const credentials = this.authService.getCredentials();
    console.log("Credentials loaded");

    console.log("Navigating to login page:", BookscanService.LOGIN_URL);
    await this.page.goto(BookscanService.LOGIN_URL);
    console.log("Login page loaded");

    console.log("Waiting for login form elements...");
    try {
      await this.page.waitForSelector('input[name="email"]', {
        timeout: 30000,
      });
      console.log("Email input found");
      await this.page.waitForSelector('input[name="password"]', {
        timeout: 30000,
      });
      console.log("Password input found");
    } catch (error) {
      console.error("Failed to find login form elements:", error);
      console.log("Current page HTML:", await this.page.content());
      throw error;
    }

    console.log("Entering credentials...");
    await this.page.type('input[name="email"]', credentials.userId);
    await this.page.type('input[name="password"]', credentials.password);
    console.log("Credentials entered");

    console.log("Submitting login form...");
    await Promise.all([
      this.page.waitForNavigation({ timeout: 60000 }),
      this.page.click("#login-btn"),
    ]);
    console.log("Form submitted");

    // ログイン後のURLをチェック
    const currentUrl = this.page.url();
    console.log("Current URL after login:", currentUrl);
    if (currentUrl.includes("login.php")) {
      throw new Error("Login failed. Please check your credentials.");
    }
    console.log("Login successful");
  }

  public async getBookList(): Promise<BookshelfResponse> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    console.log("Navigating to bookshelf page:", BookscanService.BOOKSHELF_URL);
    await this.page.goto(BookscanService.BOOKSHELF_URL);
    console.log("Bookshelf page loaded");

    console.log("Waiting for book list...");
    try {
      await this.page.waitForSelector("#hondana_list", { timeout: 30000 });
      console.log("Book list found");
    } catch (error) {
      console.error("Failed to find book list:", error);
      console.log("Current page HTML:", await this.page.content());
      throw error;
    }

    console.log("Extracting book information...");
    const books = await this.page.evaluate(() => {
      const bookElements = document.querySelectorAll(".hondana_list01");
      return Array.from(bookElements).map((element) => {
        const titleElement = element.querySelector(".hondana_list_contents h3");
        const linkElement = element.querySelector(".fancybox");
        const title = titleElement?.textContent?.trim() || "";
        const url = linkElement?.getAttribute("href") || "";
        return { title, url };
      });
    });
    console.log(`Found ${books.length} books`);

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
    console.log("Navigating to book detail page:", bookUrl);
    await this.page.goto(bookUrl);
    console.log("Book detail page loaded");

    // PDFダウンロードリンクを探して取得
    console.log("Searching for PDF download link...");
    const downloadUrl = await this.page.evaluate(() => {
      const downloadLink = document.querySelector('a[href*="pdf"]');
      return downloadLink?.getAttribute("href") || null;
    });

    if (!downloadUrl) {
      console.error("PDF download link not found");
      console.log("Current page HTML:", await this.page.content());
      throw new Error(`PDF download link not found for book: ${book.title}`);
    }
    console.log("Found PDF download link:", downloadUrl);

    // PDFをダウンロード
    console.log("Starting PDF download...");
    const fullDownloadUrl = new URL(downloadUrl, BookscanService.BASE_URL).href;
    console.log("Full download URL:", fullDownloadUrl);

    // ダウンロードを開始
    const downloadPromise = new Promise<void>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;
      let intervalId: NodeJS.Timeout;

      const checkDownload = () => {
        const files = fs.readdirSync(path.join(process.cwd(), "downloads"));
        const pdfFiles = files.filter((file) => file.endsWith(".pdf"));
        if (pdfFiles.length > 0) {
          clearTimeout(timeoutId);
          clearInterval(intervalId);
          resolve();
        }
      };

      // 1秒ごとにダウンロードディレクトリをチェック
      intervalId = setInterval(checkDownload, 1000);

      // 30秒でタイムアウト
      timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        reject(new Error("Download timeout"));
      }, 30000);

      // ダウンロードを開始
      this.page
        ?.goto(fullDownloadUrl, { waitUntil: "networkidle0" })
        .catch((error) => {
          // ダウンロード中にページが閉じられるエラーは無視
          if (!error.message.includes("Navigating frame was detached")) {
            reject(error);
          }
        });
    });

    try {
      await downloadPromise;
      console.log(`Downloaded: ${book.title}`);
    } catch (error) {
      console.error(`Failed to download ${book.title}:`, error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
