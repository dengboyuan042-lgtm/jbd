# Snow Glass · 毛玻璃 + 下雪

用代码做的一条 12 秒竖屏视频：一块苹果风格的毛玻璃面板立在冬夜的雪里，雪落在玻璃上会停一下再滑走。

工程按 [xilo-opus-video](https://github.com/Kianzzz/xilo-opus-video) 的流程做：
三个方案 → 每个方案出预览 → 确认 → `brief.md` → 逐镜头制作 → 逐帧渲染 → 抽帧验收。

## 看什么

- `renders/final-a-lockscreen.mp4` —— **主推**（方案 A · 锁屏）
- `renders/final-b-macro.mp4` —— 方案 B · 微距（无字，纯材质）
- `renders/final-c-dolly.mp4` —— 方案 C · 穿行（三块玻璃，三个词）
- `brief.md` —— 这支片子的**完整提示词**，换主题可以直接复用

三个方案共用一套材质和背景代码，只是镜头不同：`scene/lib.js`（物理） + `scene/scenes.js`（镜头）。

## 怎么再渲一遍

依赖：Node 18+、ffmpeg。canvas 与 ffmpeg 都在 `../../tools` 里（`@napi-rs/canvas`、`imageio-ffmpeg`）。

```bash
# 一张静帧
node scene/render.js a --still 4.0 --out preview.png --size 1080x1920

# 整片（带配乐）
node scene/render.js a --out renders/x.mp4 --size 1080x1920 --fps 30 --duration 12 --audio audio/mix.wav

# 只重渲 5–9 秒那一段
node scene/render.js a --out renders/seg.mp4 --start 5 --duration 4 --audio audio/mix.wav

# 配乐
python3 audio/make_score.py audio/score.wav
```

`render.js` 找不到 ffmpeg 时会去 `tools/bin/ffmpeg` 找。

## 浏览器里实时预览

```bash
node serve.js        # http://localhost:4173
```

页面上可以切换 A / B / C 三个方案、暂停、拖时间轴。它和渲染器跑的是同一份
`lib.js` / `scenes.js`，并暴露 `window.render(t)`，所以 skill 的 `scripts/render.py`
（Playwright 版）也能直接驱动它。

## 关键决定

- **画面只由 t 决定**：没有 requestAnimationFrame 驱动的状态，随机数全部固定种子，
  弹簧是闭式解，所以任何一帧都能单独重渲。
- **毛玻璃是真算出来的**：背景以 1/3 分辨率采样 → blur + saturate + brightness → 拉伸回填，
  再叠奶白底色、顶部高光、底部厚度、反射窗影、噪点、扫光、内圈高光、外圈渐变描边和色散。
- **性能**：背景只画一次并缓存，雪花在解析公式里算位置；单帧 695ms → 110ms。
- **声音**：numpy 合成的 pad + 风声 + 玻璃风铃，风铃的时间点直接抄画面里雪花落地的时刻。

## 已知不足

- 玻璃里的折射没有真实的凹凸法线，靠的是「模糊 + 放大 + 边缘高光 + 色散」四件套；
  真做折射需要 WebGL（`--subframes` 渲染会慢 4 倍）。
- 方案 B 的微距里，那颗大雪花是画出来的六角形，不是溶化的水滴形。
- 配乐是氛围铺底，没有节拍；如果你想要卡点版本，得重排时间轴。
