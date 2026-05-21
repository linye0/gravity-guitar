# Gravity Guitar - 项目记忆

## 项目定位
吉他极客训练工具集，纯前端 HTML 单页应用，深色主题（`#121214` 背景），通过 **Web Audio API** 实现交互式练耳/指板训练。

## 技术栈
- **框架**: Next.js 14 (App Router) + React 18 + TypeScript
- **样式**: CSS Modules
- **音频**: Web Audio API
- **无外部依赖**

## 目录结构

```
gravity-guitar/
├── app/
│   ├── layout.tsx                 (全局布局)
│   ├── globals.css                (全局样式重置)
│   ├── page.tsx                   (首页导航)
│   ├── page.module.css
│   ├── interval-exercises/
│   │   ├── page.tsx               (调性引力场练耳器)
│   │   └── page.module.css
│   ├── guitar-radar/
│   │   ├── page.tsx               (低音弦根音雷达)
│   │   └── page.module.css
│   └── lyric-practice/
│       ├── page.tsx               (视唱生成与练耳控制台)
│       └── page.module.css
├── lib/
│   ├── notes.ts                   (共享音高数据: NOTES, ROOT_NOTES, INTERVAL_DATA, PITCH_SPACE)
│   └── audio.ts                   (Web Audio 工具函数)
├── ref/                           (原始 HTML 原型，保留作参考)
├── package.json
├── tsconfig.json
└── MEMORY.md
```

## 各模块详情

### 1. `app/page.tsx` - 导航首页
- 三个入口卡片: 练耳器 / 根音雷达 / 视唱控制台
- 指向 `/interval-exercises`, `/guitar-radar`, `/lyric-practice`

### 2. `app/interval-exercises/page.tsx` - 音程练耳器 (Client Component)
- **核心功能**: 播放参考根音(Drone)，再播放目标音程，用户按键选择音程名
- **模式**:
  - 固定调(Fixed): 选定根音(C/Bb等)不变
  - 动态游走(Dynamic): 每 N 轮自动切换调性，3 秒过渡提示
- **音区控制**: 靶区可选上行/下行/随机; 基底音区可选低/中/高
- **跟唱阶段**: 选择/超时后进入跟唱，可开启"握手校准"先播 Do 再播目标音
- **音程矩阵**: 12 音程可选，默认 1/2/3/4/5
- **状态机**: IDLE -> REACTION(听音选择) -> SINGING(跟唱) -> TRANSITION(动态切换) -> REACTION
- **快捷键**: 键盘 1/q/w/2/3/4/r/5/t/6/y/7 选音程, P 暂停

### 3. `app/guitar-radar/page.tsx` - 根音雷达 (Client Component)
- **核心功能**: 随机出题(6/5/4弦上找音名)，思考后显示第几品
- **琴弦**: 6弦(E, idx:4), 5弦(A, idx:9), 4弦(D, idx:2)
- **状态机**: THINKING -> ANSWERING -> THINKING 循环
- **快捷键**: P暂停, A答案开关, 6/5/4弦开关, +/-思考时间, [/]答案时间
- **进度条**: 蓝色思考 -> 紫色答案

### 4. `app/lyric-practice/page.tsx` - 视唱音序器 (Client Component)
- **核心功能**: 钢琴卷帘网格编辑器，点击绘制/拖拽连绘/滚轮调长度
- **视图**: 十二平均律 / 大调音阶 / 自然小调
- **音域裁剪**: 出题上下限，随机生成自动约束
- **随机视唱出题**: 锚定 Do，平滑跳进(<=7半音)，20%留空概率
- **播放**: BPM 可调，精度 1/8 或 1/16 音符，scheduler 模式

### 5. `lib/` - 共享库
- **notes.ts**: 音高数据常量 (NOTES, ROOT_NOTES, INTERVAL_DATA, PITCH_SPACE)
- **audio.ts**: 音频工具 (getAudioContext, playToneSequence, playTone, clearOscillators)

## 代码风格约定
- 纯 TypeScript，'use client' 用于交互组件
- CSS Modules 管理样式，无 Tailwind
- 深色主题配色: `#121214` 背景, `#1c1c1f` 卡片, `#4ade80` 练耳, `#60a5fa` 根音, `#a855f7` 视唱
- 所有页面完全自包含，共享数据通过 `lib/` 提取
- 所有页面都保留有回首页的链接

## 启动方式
```bash
npm run dev    # 开发模式，默认 http://localhost:3000
npm run build  # 构建生产版本
npm run start  # 启动生产服务器
```

## 原始代码
`ref/` 目录下保留原始 HTML 原型文件，供参考。
