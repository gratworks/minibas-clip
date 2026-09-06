# MiniBas Clip — CLAUDE.md

## 概要
ミニバス（U12バスケ）の自チーム向け、映像タグ付け・スタッツ集計・選手別ハイライト書き出しアプリ。
PlayCut（https://playcut.jp/）を参考にした個人利用ツール。運用は新田本人が担当（保護者撮影の試合動画を取り込み、タグ付け→スタッツ確認→選手別ハイライトをLINEで共有）。
サーバー costを持たないため、映像・DBは完全ローカル保存（クラウド不使用）。

関連: `Gratcraft_経営戦略部/.company/dev/projects/minibas-clip/docs/overview.md`
（※既存の `.company/dev/projects/minibasket/`＝Expo製の習慣化アプリ「Hoop Up」とは別プロジェクト）

## 技術スタック
- Electron + electron-vite + React 18 + TypeScript + Tailwind CSS（自前コンポーネント、shadcn等は不使用）
- DB: Node 標準の `node:sqlite`（`DatabaseSync`、main プロセスのみ、`%APPDATA%/MiniBas Clip/data.db`、WAL）
  - better-sqlite3 は不採用。このマシンに node-gyp 用の Python/VC++ ビルド環境がなく、ネイティブビルドで詰まったため。Electron 33+ が同梱する Node には `node:sqlite` が標準搭載されており、ビルドチェーン不要
  - API は better-sqlite3 とほぼ同じ（`prepare().run()/get()/all()`、`@name` 名前付きパラメータも動作確認済み）。ただし `db.transaction()` ヘルパーは無いため、複数INSERTの一括処理は `BEGIN`/`COMMIT`/`ROLLBACK` を手動で呼ぶ（`src/main/db/migrations.ts` 参照）
- 動画処理: ffmpeg-static / ffprobe-static を同梱。probe・proxy変換・クリップ切り出し・ハイライト結合はすべて main プロセスから spawn
- パッケージング: electron-builder（Windows NSIS。Macは後日）
- 状態管理: zustand（renderer側の選択試合/動画/再生位置など）
- パッケージ管理: npm 単一パッケージ（モノレポ不使用）

## ディレクトリ構成
```
src/shared/       # IPC契約(ipc.ts)・型(types.ts)。main/renderer共通の唯一の情報源
src/main/
  db/             # better-sqlite3 接続・migrations・repos
  media/          # media:// カスタムプロトコル（Range配信、Phase1で実装）
  ffmpeg/         # bin.ts(パス解決) probe.ts cut.ts concat.ts drawtext.ts
  jobs/           # 直列ジョブキュー・進捗イベント（Phase4で実装）
  ipc/            # ipcMain ハンドラ（players, games, videos, events, eventTypes, stats, export, app）
src/preload/      # contextBridge、window.api のみを公開
src/renderer/src/
  screens/        # Games, Tagging, Roster, Stats, Settings
  components/     # VideoPlayer, Timeline, EventList, ClipTrimmer, ExportDialog 等
  store/ hooks/ lib/
resources/fonts/  # drawtext用 Noto Sans JP（同梱、asarUnpack対象）
```

## DBスキーマ（要点）
`players / games / videos / event_types / events / exports / settings / schema_version`
- `events` は `game_id, video_id, event_type_id, player_id(NULL可), t_sec, quarter, clip_in_sec, clip_out_sec` を持つ。クリップの尺は `event_types.pre_sec/post_sec` がデフォルト、`clip_in_sec/out_sec` で個別上書き。
- `event_types` はミニバス用に3Pなしで初期投入（`src/main/db/migrations.ts` の `DEFAULT_EVENT_TYPES`）。stat系（2P/FT/REB/AST/STL/BLK/TOV/PF）とhighlight系（ナイスディフェンス等）に分かれ、スタッツ集計は stat系のみ対象。
- 詳細は `src/main/db/migrations.ts` を正とする（このファイルに重複記載しない）。

## 命名規則
- ファイル: kebab-case（コンポーネントファイルは PascalCase 可、例 `VideoPlayer.tsx`）
- DBカラム: snake_case、TypeScript側は camelCase（`toPlayer()`のような変換関数で境界を明示）
- IPCチャンネル: `<ドメイン>:<動詞>`（例 `players:list`, `export:highlight`）。新規追加時は必ず `src/shared/ipc.ts` の `IpcMap` に先に型を足してから実装する
- renderer は `fs` / `child_process` / better-sqlite3 に一切触れない。すべて `window.api.invoke()` 経由

## 開発フロー
- `npm install` → `npm run dev` でローカル起動確認（ネイティブモジュールのビルドは不要）
- **コード変更後は必ずローカルで動作確認し、ユーザーのOKを得てから commit/push する**（グラートクラフト共通ルール）
- ffmpeg 関連の変更は実際の試合動画（iPhone HEVC/VFR想定）で必ず手元確認する。ユニットテストだけで済ませない

## 必須ルール
- renderer から直接ファイルパスを扱わない（`media://video/{id}` 経由。日本語パス対策も兼ねる）
- ffmpeg の `spawn` は配列引数渡し（`shell:false`）。日本語を含むファイル名・パスをシェル経由で組み立てない
- `webSecurity` は無効化しない
- 大きい動画ファイルは移動・コピーせずパス参照のみ（Dropbox配下は同期タイミングに注意）
- 進捗が長時間のジョブ（proxy変換・ハイライト書き出し）は必ずキャンセル可能にする
