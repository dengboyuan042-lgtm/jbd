# 在 macOS 上运行

## 1. 准备 Node

需要 Node 20.9 以上（推荐 22）。检查：

```bash
node -v
```

没有或版本太低，用 Homebrew 装：

```bash
brew install node
```

## 2. 安装依赖

在解压后的目录里：

```bash
cd asksia-pro
npm install
```

第一次大约 1–2 分钟。**不需要装 Postgres、Docker 或任何数据库**——开发模式用的是内嵌的 PGlite（WASM 版 Postgres，自带 pgvector）。

## 3. 配置

```bash
cp .env.example .env.local
```

默认配置即可直接跑，全部功能都能用，不需要任何 API key。想改的话只有一项建议改：

```bash
AUTH_SECRET=随便一串足够长的随机字符串
```

## 4. 启动

```bash
npm run dev
```

打开 <http://localhost:3000>，注册一个账号即可开始用。

> 数据库文件和上传的文件会存在项目目录下的 `.data/`，删掉它就等于清空所有数据。

---

## 建议用 Chrome 或 Safari

录音页面的实时转写用的是浏览器端的 Web Speech API（**在本机运行，音频不外传**）。Chrome、Edge、Safari 支持；Firefox 不支持，那种情况下录音仍会保存，只是没有实时字幕。

第一次进录音页面，macOS 会弹窗要麦克风权限，允许即可。

---

## 接入真正的大模型（可选）

开箱即用的是内置引擎：它不是占位符，而是真的在做抽取式摘要、关键词/主题提取、行动项与决策识别、闪卡完形填空、测验干扰项生成——所有输出都来自你自己的材料并带引用。

想换成托管模型，编辑 `.env.local`：

```bash
# OpenAI（或任何兼容 OpenAI 接口的网关：Azure、Groq、OpenRouter、Ollama、LM Studio）
AI_DRIVER=openai
OPENAI_API_KEY=sk-...
AI_CHAT_MODEL=gpt-4o-mini

# 顺便把向量也换成模型生成的
EMBEDDING_DRIVER=provider
AI_EMBEDDING_MODEL=text-embedding-3-small
```

Anthropic 用 `AI_DRIVER=anthropic` + `ANTHROPIC_API_KEY`，Google 用 `AI_DRIVER=google` + `GOOGLE_API_KEY`。

改完重启 `npm run dev` 即可，代码一行都不用动。

> 换 embedding 供应商后，已有材料的向量维度可能不一致，需要重新上传一次，或清空 `.data/` 重来。

服务端转写（把已上传的音视频文件转成文字）需要：

```bash
SPEECH_DRIVER=openai-whisper   # 或 deepgram
OPENAI_API_KEY=sk-...          # 或 DEEPGRAM_API_KEY=...
```

---

## 其他命令

```bash
npm run build && npm start   # 生产模式
npm run typecheck            # 严格类型检查
npm test                     # 22 个单元测试
npm run db:push              # 手动建表（平时会自动执行）
npm run account:create -- you@example.com "你的名字" yourpassword
```

## 上线到真服务器

1. 准备一个装了 `vector` 扩展的 Postgres 15+，设置
   `DATABASE_DRIVER=postgres` 和 `DATABASE_URL`
2. 设置一个强随机的 `AUTH_SECRET`
3. 可选：`STORAGE_DRIVER=s3`（S3 / R2 / MinIO 都行）
4. `npm run build && npm start`

没有任何原生依赖，Node 20+ 的机器都能跑。更多细节见 `README.md`。
