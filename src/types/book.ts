export interface Book {
  title: string;
  url: string;
  downloadUrl?: string;
}

export interface BookshelfResponse {
  books: Book[];
  totalCount: number;
}

export interface AuthConfig {
  userId: string;
  password: string;
}
