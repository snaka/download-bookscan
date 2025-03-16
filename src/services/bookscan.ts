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
    await Promise.all([
      client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloadPath,
      }),
      this.page.setExtraHTTPHeaders({
        Accept: "application/pdf",
      }),
    ]);
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

    // PDFダウンロードリンクを探してクリック
    console.log("Searching for PDF download link...");
    const downloadPromise = new Promise<void>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;
      let intervalId: NodeJS.Timeout;

      // ダウンロード前のファイル一覧を取得
      const downloadPath = path.join(process.cwd(), "downloads");
      const beforeFiles = new Set(fs.readdirSync(downloadPath));

      const checkDownload = () => {
        const currentFiles = fs.readdirSync(downloadPath);
        // 新しく追加されたPDFファイルを検出（ダウンロード中のファイルは除外）
        const newFiles = currentFiles.filter(
          (file) =>
            !beforeFiles.has(file) &&
            file.endsWith(".pdf") &&
            !file.endsWith(".crdownload")
        );
        if (newFiles.length > 0) {
          clearTimeout(timeoutId);
          clearInterval(intervalId);
          console.log(`File downloaded: ${newFiles[0]}`);
          resolve();
        }
      };

      // 1秒ごとにダウンロードディレクトリをチェック
      intervalId = setInterval(checkDownload, 1000);

      // 60秒でタイムアウト
      timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        reject(
          new Error(
            "Download timeout: ファイルのダウンロードに時間がかかっています。ダウンロードは継続中の可能性があります。"
          )
        );
      }, 60000);

      // ダウンロードリンクをクリック
      this.page
        ?.waitForSelector('a[href*="pdf"]')
        .then(async (element) => {
          if (element) {
            // リンクの位置を取得
            const box = await element.boundingBox();
            if (box) {
              // リンクの中央をクリック
              await this.page?.mouse.click(
                box.x + box.width / 2,
                box.y + box.height / 2
              );
            } else {
              reject(new Error("Failed to get link position"));
            }
          } else {
            reject(new Error("Download link not found"));
          }
        })
        .catch(reject);
    });

    try {
      await downloadPromise;
      // ダウンロードの成功を確認
      const downloadPath = path.join(process.cwd(), "downloads");
      const files = fs.readdirSync(downloadPath);
      const downloadedFile = files.find(
        (file) =>
          file.endsWith(".pdf") &&
          !file.endsWith(".crdownload") &&
          file.includes(book.title)
      );

      if (downloadedFile) {
        console.log(`Downloaded: ${downloadedFile}`);
      } else {
        throw new Error("Download failed: File not found");
      }
    } catch (error) {
      // タイムアウトエラーでもファイルが存在する場合は成功とみなす
      if (error instanceof Error && error.message === "Download timeout") {
        const downloadPath = path.join(process.cwd(), "downloads");
        const files = fs.readdirSync(downloadPath);
        const downloadedFile = files.find(
          (file) =>
            file.endsWith(".pdf") &&
            !file.endsWith(".crdownload") &&
            file.includes(book.title)
        );

        if (downloadedFile) {
          console.log(`Downloaded: ${downloadedFile}`);
          return;
        }
      }

      // タイムアウトエラー以外のエラーの場合のみエラーを表示
      if (
        !(error instanceof Error && error.message.includes("Download timeout"))
      ) {
        console.error(`Failed to download ${book.title}:`, error);
        throw error;
      }
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
