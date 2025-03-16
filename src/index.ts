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
  .action(async (options) => {
    const limit = parseInt(options.number, 10);
    if (isNaN(limit) || limit < 1) {
      console.error("Error: Number of books must be a positive integer");
      process.exit(1);
    }
    try {
      const authService = AuthService.getInstance();
      authService.validateCredentials();

      const bookscanService = new BookscanService(authService);
      await bookscanService.initialize();

      console.log("Logging in to Bookscan...");
      await bookscanService.login();

      console.log("Fetching book list...");
      const { books, totalCount } = await bookscanService.getBookList();
      console.log(`Found ${totalCount} books in your bookshelf.`);

      console.log(`Downloading ${limit} books...`);
      for (let i = 0; i < Math.min(limit, books.length); i++) {
        try {
          const book = books[i];
          console.log(`Downloading (${i + 1}/${limit}): ${book.title}`);
          await bookscanService.downloadBook(book);
        } catch (error) {
          console.error(`Failed to download book (${i + 1}/${limit}):`, error);
        }
      }

      await bookscanService.close();
      console.log("All downloads completed!");
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
