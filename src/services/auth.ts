import { AuthConfig } from "../types/book";
import dotenv from "dotenv";

export class AuthService {
  private static instance: AuthService;
  private config: AuthConfig | null = null;

  private constructor() {
    dotenv.config();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public getCredentials(): AuthConfig {
    if (this.config) {
      return this.config;
    }

    const userId = process.env.BOOKSCAN_USER_ID;
    const password = process.env.BOOKSCAN_PASSWORD;

    if (!userId || !password) {
      throw new Error(
        "Missing required environment variables. Please set BOOKSCAN_USER_ID and BOOKSCAN_PASSWORD."
      );
    }

    this.config = { userId, password };
    return this.config;
  }

  public validateCredentials(): void {
    this.getCredentials(); // Will throw if credentials are not set
  }
}
