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

      const { books, totalCount, hasNextPage } =
        await bookscanService.getBookList(page);
      console.log(`Page ${page}: ${totalCount} books found.`);

      for (let i = 0; i < Math.min(limit, books.length); i++) {
        const book = books[i];
        try {
          await bookscanService.downloadBook(book);
        } catch (error) {
          console.error(`Failed to download: ${book.title}`, error);
        }
      }

      await bookscanService.close();
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
