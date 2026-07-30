# NEON MORPH · Endless Game

霓虹赛博风无尽跑酷（Temple Run 简化变体）。三车道变形冲刺，匹配障碍颜色连击上瘾。

## 预览地址

**https://yaoyuana.github.io/Endless-Game/**

### 首次开启 GitHub Pages（只需一次）

1. 打开仓库 [Settings → Pages](https://github.com/yaoyuana/Endless-Game/settings/pages)
2. **Build and deployment → Source** 选择 **Deploy from a branch**
3. Branch 选 **`gh-pages`**，目录选 **`/ (root)`**，保存
4. 约 1 分钟后打开上面的预览地址

之后每次推送到 `main`，Actions 会自动更新 `gh-pages` 并发布。

## 玩法

| 形态 | 操作 | 能力 |
|------|------|------|
| △ SPIKE | ↑ / 空格 / 上滑 | 跳跃，砸碎低矮障碍 |
| ◇ GLIDE | ↓ / 下滑 | 滑铲，穿过高架激光门 |
| ⬡ PULSE | F / 3 / 点击 | 相位冲刺，短暂穿障吸能 |

- **←→** 换道，**Q/E** 或 **1/2/3** 切换形态
- **同色匹配撞碎** = 连击 + Overclock 充能
- **Shift / ⚡** 释放大招：慢动作 ×3 分狂潮
- 擦身而过 **NEAR MISS** 同样加分加连击

## 本地运行

直接打开 `index.html`，或：

```bash
python -m http.server 8080
# 访问 http://localhost:8080
```

## 技术

- 纯 HTML5 Canvas + CSS + JS，无构建步骤
- 程序化霓虹几何素材 + 透视网格 + 动态速度线
- GitHub Actions 自动同步 `gh-pages` 分支部署
