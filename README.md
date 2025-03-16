# BOOKSCAN PDF Downloader

BOOKSCAN の本棚に登録されている本をPDFとしてダウンロードするCLIツール。

## 機能

- BOOKSCAN アカウントへのログイン
- 本棚に登録されている本の一覧取得
- PDFファイルの一括ダウンロード
- ダウンロード進捗の表示

## 必要条件

- Node.js (v16以上)
- npm

## インストール

```bash
# リポジトリのクローン
git clone https://github.com/snaka/download-bookscan.git
cd download-bookscan

# 依存パッケージのインストール
npm install

# ビルド
npm run build

# グローバルインストール（オプション）
npm install -g download-bookscan
```

## 環境変数の設定

1. `.env.example` をコピーして `.env` ファイルを作成:
```bash
cp .env.example .env
```

2. `.env` ファイルを編集して、Bookscanの認証情報を設定:
```
BOOKSCAN_USER_ID=your.email@example.com
BOOKSCAN_PASSWORD=your_password
```

## 使用方法

グローバルインストールした場合:
```bash
download-bookscan download
```

ローカルで実行する場合:
```bash
# 開発モード
npm run dev download

# ビルド済みバージョン
npm start download
```

## オプション

- `-n, --number <number>`: ダウンロードする本の数を指定します (デフォルト: 1)
- `-p, --page <page>`: ダウンロードを開始するページ番号を指定します (デフォルト: 1)
- `-a, --all`: すべてのページから本をダウンロードします
- `-f, --filter <keyword>`: タイトルにキーワードが含まれる本をフィルタリングします

## ダウンロードファイル

- ダウンロードしたPDFファイルは `downloads` ディレクトリに保存されます
- ディレクトリが存在しない場合は自動的に作成されます

## 注意事項

- このツールはBOOKSCANの利用規約に従って使用してください
- 大量のダウンロードはサーバーに負荷をかける可能性があるため、適切な間隔を空けることを推奨します
- ダウンロードしたPDFファイルの取り扱いには十分注意してください

## ライセンス

[MIT](LICENSE.txt)

## 作者

snaka
