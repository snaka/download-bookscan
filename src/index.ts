#!/usr/bin/env node
import { Command } from "commander";
import { AuthService } from "./services/auth";
import { BookscanService } from "./services/bookscan";

const program = new Command();

program
  .name("download-bookscan")
  .description("Download PDFs from Bookscan")
  .version("1.0.0");

program
  .command("download")
  .description("Download books from your Bookscan bookshelf")
  .option("-n, --number <number>", "Number of books to download", "1")
  .option("-p, --page <page>", "Page number to download from", "1")
  .option("-a, --all", "Download books from all pages")
  .action(async (options) => {
    const limit = parseInt(options.number, 10);
    const page = parseInt(options.page, 10);
    if (isNaN(limit) || limit < 1) {
      console.error("Error: Number of books must be a positive integer");
      process.exit(1);
    }
    if (isNaN(page) || page < 1) {
      console.error("Error: Page number must be a positive integer");
      process.exit(1);
    }
    try {
      const authService = AuthService.getInstance();
      authService.validateCredentials();

      const bookscanService = new BookscanService(authService);
      await bookscanService.initialize();

      await bookscanService.login();

      if (options.all) {
        let currentPage = page;
        let totalDownloaded = 0;
        let hasNextPage = true;

        while (hasNextPage) {
          const {
            books,
            totalCount,
            hasNextPage: nextPage,
          } = await bookscanService.getBookList(currentPage);
          console.log(`Page ${currentPage}: ${totalCount} books found.`);

          console.log(
            `Downloading ${books.length} books from page ${currentPage}...`
          );
          for (let i = 0; i < books.length; i++) {
            const book = books[i];
            try {
              process.stdout.write(`[${totalDownloaded + 1}] ${book.title}`);
              await bookscanService.downloadBook(book);
              process.stdout.write(" ✓\n");
              totalDownloaded++;
            } catch (error) {
              process.stdout.write(" ✗\n");
              console.error(`Failed to download: ${book.title}`, error);
            }
          }

          hasNextPage = nextPage || false;
          if (hasNextPage) {
            currentPage++;
          }
        }
        console.log(
          `Download completed. Total books downloaded: ${totalDownloaded}`
        );
      } else {
        const { books, totalCount } = await bookscanService.getBookList(page);
        console.log(`Page ${page}: ${totalCount} books found.`);

        const downloadCount = Math.min(limit, books.length);
        console.log(`Downloading ${downloadCount} books...`);
        for (let i = 0; i < downloadCount; i++) {
          const book = books[i];
          try {
            process.stdout.write(`[${i + 1}/${downloadCount}] ${book.title}`);
            await bookscanService.downloadBook(book);
            process.stdout.write(" ✓\n");
          } catch (error) {
            process.stdout.write(" ✗\n");
            console.error(`Failed to download: ${book.title}`, error);
          }
        }
        console.log("Download completed.");
      }

      await bookscanService.close();
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
