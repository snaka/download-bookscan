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
  .description("Download all books from your Bookscan bookshelf")
  .action(async () => {
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

      for (const book of books) {
        try {
          console.log(`Downloading: ${book.title}`);
          await bookscanService.downloadBook(book);
        } catch (error) {
          console.error(`Failed to download ${book.title}:`, error);
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
