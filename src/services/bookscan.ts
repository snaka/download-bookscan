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
    "https://system.bookscan.co.jp/mypage/bookshelf_all_list.php";
  private static readonly BASE_URL = "https://system.bookscan.co.jp";

  constructor(private authService: AuthService) {}

  public async initialize(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    this.page = await this.browser.newPage();

    // デバッグ用のコンソールログを設定（エラーのみ）
    this.page.on("pageerror", (err) => console.error("Browser error:", err));

    // PDFダウンロード用のディレクトリを作成
    const downloadPath = path.join(process.cwd(), "downloads");
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath);
    }

    // PDFダウンロードの設定
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
  }

  public async login(): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    const credentials = this.authService.getCredentials();
    await this.page.goto(BookscanService.LOGIN_URL);

    try {
      await this.page.waitForSelector('input[name="email"]', {
        timeout: 30000,
      });
      await this.page.waitForSelector('input[name="password"]', {
        timeout: 30000,
      });
    } catch (error) {
      console.error("Failed to find login form elements:", error);
      throw error;
    }

    await this.page.type('input[name="email"]', credentials.userId);
    await this.page.type('input[name="password"]', credentials.password);

    await Promise.all([
      this.page.waitForNavigation({ timeout: 60000 }),
      this.page.click("#login-btn"),
    ]);

    // ログイン後のURLをチェック
    const currentUrl = this.page.url();
    if (currentUrl.includes("login.php")) {
      throw new Error("Login failed. Please check your credentials.");
    }
  }

  public async getBookList(page: number = 1): Promise<BookshelfResponse> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    const url = new URL(BookscanService.BOOKSHELF_URL);
    url.searchParams.set("q", "");
    url.searchParams.set("sort", "s");
    url.searchParams.set("page", page.toString());

    await this.page.goto(url.toString());

    try {
      await this.page.waitForSelector("#hondana_list", { timeout: 30000 });
    } catch (error) {
      console.error("Failed to find book list:", error);
      throw error;
    }
    const { books, hasNextPage } = await this.page.evaluate(() => {
      const bookElements = document.querySelectorAll(".hondana_list01");
      const books = Array.from(bookElements).map((element) => {
        const titleElement = element.querySelector(".hondana_list_contents h3");
        const linkElement = element.querySelector(".fancybox");
        const title = titleElement?.textContent?.trim() || "";
        const url = linkElement?.getAttribute("href") || "";
        return { title, url };
      });

      // 次のページがあるかどうかを確認
      const nextPageLink = document.querySelector(".next a");
      const hasNextPage = nextPageLink !== null;

      return { books, hasNextPage };
    });

    return {
      books,
      totalCount: books.length,
      hasNextPage,
      currentPage: page,
    };
  }

  public async downloadBook(book: Book): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    const bookUrl = new URL(book.url, BookscanService.BOOKSHELF_URL).href;
    await this.page.goto(bookUrl);
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

      if (!downloadedFile) {
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

        if (!downloadedFile) {
          throw new Error("Download failed: File not found");
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
