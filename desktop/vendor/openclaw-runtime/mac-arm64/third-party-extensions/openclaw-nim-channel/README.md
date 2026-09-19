# OpenClaw NIM 插件

[English](./README.md) | 中文

[OpenClaw](https://openclaw.ai/) 网易云信（NIM）渠道插件，支持 P2P 单聊、群组聊天及圈组（QChat）。

## 版本要求

> **⚠️ v1.0.0 破坏性变更**
>
> 1. **OpenClaw 版本要求**：当前版本基于 OpenClaw **2026.4.5** 进行开发。如遇到兼容性问题，请升级至 **2026.4.5 及更新版本**
> 2. **配置格式变更**：`channels.nim` 使用 `accounts.<accountKey>` 命名账户格式（不再支持旧的 `instances[]`）
> 3. **账号类型限制**：仅支持**机器人账号**登录（不支持普通个人账号）
> 4. **凭证配置方式**：推荐使用 `nimToken` 三合一配置（`appKey|accid|token`，兼容旧 `appKey-accid-token`）

## 功能特性

- 💬 P2P 单聊消息，支持可配置的访问策略
- 👥 群组聊天，支持群/发送者白名单
- 🔵 圈组（QChat）消息，支持统一白名单
- 🌊 **流式输出支持**（私聊和群组支持分块流式，圈组强制完整消息返回）
- 🔄 **多实例支持**（支持同时运行最多 3 个 NIM 实例，不同账号/AppKey）
- 📷 多媒体支持（图片、文件、音频、视频）
- 🔐 简化的 `nimToken` 认证（推荐 `appKey|accid|token`，兼容旧 `appKey-accid-token`）
- 🔄 自动重连处理
- 📝 长消息自动分片
- 🔒 私有化部署支持，可自定义服务器地址

## 安装

### 安装 Node.js

> **推荐版本**：Node.js **v24.x** (>=24.0.0, <25.0.0)

#### 方式一：官方安装包（推荐）

1. 访问 [nodejs.org](https://nodejs.org/)。
2. 下载 **Node.js v24.x**。
3. 运行安装包并按提示操作。

#### 方式二：NVM（Node 版本管理器）

```bash
# 安装 nvm（如未安装）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 重启终端或执行：
source ~/.zshrc  # bash 用户使用 ~/.bashrc

# 安装 Node.js v24
nvm install 24
nvm use 24
```

#### 方式三：Homebrew（macOS）

```bash
# 安装 Node.js v24
brew install node@24
brew link node@24
```

#### 验证安装

```bash
node --version  # 应显示 v24.x.x
```

### 安装 OpenClaw

```bash
npm install -g openclaw@latest
```

> **注意：** 如遇权限错误，请使用 `sudo npm install -g openclaw@latest`

### 安装插件

```bash
openclaw plugins install @nimsuite/openclaw-nim-channel
```

## 配置

> **注意**：从 v1.0.0 开始，`channels.nim` 使用 `accounts.<accountKey>` 命名账户格式以支持多实例（最多 3 个）。旧的 `instances[]` 已不再支持。
>
> **推荐实践**：`accountKey` 应该使用稳定的实例标识符，例如 `nim_a1b2c3d4`、`primary_bot`，不要直接使用 `accid` 作为 key。因为不同 `appKey` 下可能存在同名账号，`accountKey` 的职责是区分配置实例，而不是表达协议层身份。

### 为什么不用 `instances[]`

- OpenClaw 多账号渠道通常使用 `accounts.<accountKey>` 作为约定俗成的配置形式，便于启停、删除、状态展示和外部引用。
- `instances[]` 只有数组位置，没有稳定主键。调整顺序、插入、删除后，外部保存的实例引用容易错位。
- NIM 的协议身份是 `appKey + accid`。不同 `appKey` 下可以出现同名 `accid`，因此不能把账号名本身当成配置主键。
- 推荐做法是：`accountKey` 负责标识配置实例，`nimToken` / `appKey + accid` 负责标识 NIM 协议身份。两者分层，路由和定时任务才稳定。

### 快速配置（CLI）

```bash
# 注意：nim_a1b2c3d4 是你自定义的稳定实例键
openclaw config set channels.nim.accounts.nim_a1b2c3d4.nimToken "<appKey>|<accid>|<token>"
openclaw config set channels.nim.accounts.nim_a1b2c3d4.enabled true
openclaw config set session.dmScope per-account-channel-peer
```

> **多机器人必配**：如果你在原版 OpenClaw 下同时配置多个 NIM 机器人，必须把 `session.dmScope` 设为 `per-account-channel-peer`。  
> 否则不同机器人给同一个用户发出的私聊，会在 UI 中被合并到同一个会话里。

> **`nimToken` 格式**：`<appKey>|<accid>|<token>`（用 `|` 分隔三个字段）— **推荐**
>
> 示例：`45c6af3c98409b18a84451215d0bdd6e|testbot001|a1b2c3d4e5f6`
>
> 向后兼容：旧格式 `<appKey>-<accid>-<token>` 仍然可用
>
> 备选方式：使用独立的 `appKey`、`account`、`token` 字段（已弃用但仍支持）

#### 私有化部署配置（CLI）

```bash
openclaw config set channels.nim.accounts.nim_a1b2c3d4.advanced.weblbsUrl "https://your-lbs.example.com"
openclaw config set channels.nim.accounts.nim_a1b2c3d4.advanced.link_web "weblink.netease.im:443"
openclaw config set channels.nim.accounts.nim_a1b2c3d4.advanced.nos_uploader "https://your-nos-upload.example.com"
openclaw config set channels.nim.accounts.nim_a1b2c3d4.advanced.nos_downloader_v2 "https://your-nos-download.example.com/{bucket}/{object}"
openclaw config set channels.nim.accounts.nim_a1b2c3d4.advanced.nosSsl true
openclaw config set channels.nim.accounts.nim_a1b2c3d4.advanced.nos_accelerate "https://your-cdn.example.com/{bucket}/{object}"
openclaw config set channels.nim.accounts.nim_a1b2c3d4.advanced.nos_accelerate_host "your-cdn.example.com"
```

### 单实例配置

```json
{
  "channels": {
    "nim": {
      "accounts": {
        "nim_a1b2c3d4": {
          "enabled": true,
          "nimToken": "<appKey>|<accid>|<token>",

          "p2p": {
            "policy": "open",
            "allowFrom": ["user_abc", "user_xyz"]
          },

          "team": {
            "policy": "open",
            "allowFrom": ["groupId_1", "groupId_2|user_abc", "1|groupId_3", "2|groupId_4", "1|groupId_5|user_xyz"]
          },

          "qchat": {
            "policy": "open",
            "allowFrom": [
              "serverId_1",
              "serverId_2|channelId_1",
              "serverId_2|channelId_2|user_abc",
              "serverId_3||user_xyz"
            ]
          },

          "advanced": {
            "mediaMaxMb": 30,
            "textChunkLimit": 4000,
            "debug": false,
            "weblbsUrl": "https://your-lbs.example.com",
            "link_web": "weblink.netease.im:443",
            "nos_uploader": "https://your-nos-upload.example.com",
            "nos_downloader_v2": "https://your-nos-download.example.com/{bucket}/{object}",
            "nosSsl": true,
            "nos_accelerate": "https://your-cdn.example.com/{bucket}/{object}",
            "nos_accelerate_host": "your-cdn.example.com"
          }
        }
      }
    }
  }
}
```

### 多实例配置

同时运行最多 3 个 NIM 实例，使用不同账号或 AppKey：

```json
{
  "channels": {
    "nim": {
      "accounts": {
        "nim_a1b2c3d4": {
          "enabled": true,
          "nimToken": "<appKey1>|<openclaw>|<token1>",
          "p2p": { "policy": "open" },
          "team": { "policy": "allowlist", "allowFrom": ["team_abc"] },
          "qchat": { "policy": "disabled" }
        },
        "nim_b9e8f102": {
          "enabled": true,
          "nimToken": "<appKey2>|<openclaw>|<token2>",
          "p2p": { "policy": "allowlist", "allowFrom": ["user_vip"] },
          "team": { "policy": "disabled" },
          "qchat": { "policy": "open" }
        },
        "nim_c3f74d88": {
          "enabled": false,
          "nimToken": "<appKey3>|<jiajia01>|<token3>",
          "p2p": { "policy": "open" }
        }
      }
    }
  }
}
```

> **注意**：最多 3 个账户条目（无论是否启用）。每个账户条目保持独立连接，可以有不同的策略。
>
> 上面的示例故意展示了两个不同 `appKey` 下都使用 `openclaw` 作为 `accid` 的场景。此时仍然应该使用不同的 `accountKey`（如 `nim_a1b2c3d4`、`nim_b9e8f102`）区分实例，而不是直接把 `accid` 当 key。

### 流式输出配置

**私聊和群组消息**支持分块流式输出，实现实时响应传递。**圈组消息**使用完整消息传递（流式被强制禁用）。

要启用流式输出，配置 OpenClaw 的分块流式设置：

```yaml
# config.yaml
agents:
  defaults:
    blockStreamingDefault: "on"
    blockStreamingBreak: "text_end"
    blockStreamingChunk:
      minChars: 150
      maxChars: 600

channels:
  nim:
    accounts:
      nim_a1b2c3d4:
        enabled: true
        nimToken: "your-credentials"
```

流式输出详细配置，请参阅：

- [`BLOCK_STREAMING_CONFIG.md`](./BLOCK_STREAMING_CONFIG.md) — 分块流式配置指南
- [`STREAMING_GUIDE.md`](./STREAMING_GUIDE.md) — 实时流式数据使用说明

> **圈组特别说明**：圈组消息强制禁用流式输出和文本分块，以避免消息碎片化，提升用户体验。圈组始终以完整消息形式传递。

### 配置参考

#### 顶层字段

| 字段       | 类型   | 默认值 | 说明                                 |
| ---------- | ------ | ------ | ------------------------------------ |
| `accounts` | object | —      | 命名账户映射，键名为稳定实例标识符，推荐不要直接使用 `accid` |

#### 账户字段

| 字段              | 类型    | 默认值  | 说明                                                           |
| ----------------- | ------- | ------- | -------------------------------------------------------------- |
| `enabled`         | boolean | `false` | 启用/禁用该账户                                                |
| `nimToken`        | string  | —       | 凭证：推荐 `appKey\|accid\|token`，兼容旧 `appKey-accid-token` |
| `antispamEnabled` | boolean | `true`  | 启用反垃圾邮件保护                                             |

#### `p2p` — 单聊（私聊）

| 字段        | 类型   | 默认值   | 说明                                               |
| ----------- | ------ | -------- | -------------------------------------------------- |
| `policy`    | string | `"open"` | `open` · `allowlist` · `disabled`                  |
| `allowFrom` | array  | `[]`     | 允许的发送者账号 ID（`policy="allowlist"` 时生效） |

**策略行为：**

| `policy`    | `allowFrom` | 消息处理                     | 好友申请自动同意         |
| ----------- | ----------- | ---------------------------- | ------------------------ |
| `open`      | 任意        | 接受所有消息                 | 自动同意所有             |
| `allowlist` | 非空        | 仅接受列表中的发送者         | 仅自动同意列表中的发送者 |
| `allowlist` | 空          | 等同于 `disabled` — 拒绝所有 | 不自动同意               |
| `disabled`  | 任意        | 拒绝所有消息                 | 不自动同意               |

#### `team` — 群组

| 字段        | 类型   | 默认值   | 说明                                                   |
| ----------- | ------ | -------- | ------------------------------------------------------ |
| `policy`    | string | `"open"` | `open` · `allowlist` · `disabled`                      |
| `allowFrom` | array  | `[]`     | 白名单条目 — 格式见下方（`policy="allowlist"` 时生效） |

**策略行为：** 与 P2P 规则一致 — `allowlist` 且 `allowFrom` 为空时等同于 `disabled`。

**`team.allowFrom` 条目格式：**

| 格式                     | 说明                                   |
| ------------------------ | -------------------------------------- |
| `"teamId"`               | 该群任意发送者（高级群和超大群均匹配） |
| `"teamId\|accountId"`    | 该群中指定发送者（两种群类型均匹配）   |
| `"1\|teamId"`            | 任意发送者，仅高级群                   |
| `"2\|teamId"`            | 任意发送者，仅超大群                   |
| `"1\|teamId\|accountId"` | 指定发送者，仅高级群                   |
| `"2\|teamId\|accountId"` | 指定发送者，仅超大群                   |

#### `qchat` — 圈组

| 字段        | 类型   | 默认值   | 说明                                                   |
| ----------- | ------ | -------- | ------------------------------------------------------ |
| `policy`    | string | `"open"` | `open` · `allowlist` · `disabled`                      |
| `allowFrom` | array  | `[]`     | 白名单条目 — 格式见下方（`policy="allowlist"` 时生效） |

配置了 NIM 凭证后，圈组功能会自动启动。设置 `policy: "disabled"` 可完全关闭。

**策略行为：** 与 P2P 规则一致 — `allowlist` 且 `allowFrom` 为空时等同于 `disabled`。

**`qchat.allowFrom` 条目格式：**

| 格式                               | 说明                           |
| ---------------------------------- | ------------------------------ |
| `"serverId"`                       | 该服务器下所有频道、所有发送者 |
| `"serverId\|channelId"`            | 该服务器+频道下所有发送者      |
| `"serverId\|channelId\|accountId"` | 该服务器+频道下指定发送者      |
| `"serverId\|\|accountId"`          | 该服务器下任意频道的指定发送者 |

`allowFrom` 列表（`policy="allowlist"` 时）还控制以下行为：

- **服务器订阅**：自动订阅条目中提取的服务器 ID；`policy="open"` 时自动发现所有已加入的服务器。
- **服务器邀请自动同意**：由 `policy` 控制：
  - `open` — 自动同意所有服务器邀请
  - `allowlist` — 仅自动同意 `allowFrom` 列表中服务器 ID 的邀请；空列表则拒绝所有
  - `disabled` — 不自动同意任何邀请

#### `advanced` — 高级设置

| 字段                  | 类型    | 默认值  | 说明                                 |
| --------------------- | ------- | ------- | ------------------------------------ |
| `mediaMaxMb`          | number  | `30`    | 最大媒体文件大小（MB）               |
| `textChunkLimit`      | number  | `4000`  | 每条消息最大字符数                   |
| `debug`               | boolean | `false` | 启用 SDK 调试日志                    |
| `weblbsUrl`           | string  | —       | LBS 地址（私有化部署）               |
| `link_web`            | string  | —       | WebSocket/TCP 连接地址（私有化部署） |
| `nos_uploader`        | string  | —       | NOS 上传地址（私有化部署）           |
| `nos_downloader_v2`   | string  | —       | NOS 下载地址格式（私有化部署）       |
| `nosSsl`              | boolean | —       | NOS 下载是否启用 HTTPS（私有化部署） |
| `nos_accelerate`      | string  | —       | CDN 加速 URL 格式（私有化部署）      |
| `nos_accelerate_host` | string  | —       | CDN 加速命中域名（私有化部署）       |

## 获取凭证

> **重要提示**：仅支持**机器人账号**。普通个人账号无法使用此插件。

1. 登录[网易云信控制台](https://app.netease.im/)
2. 创建或选择应用
3. 在应用设置中复制 **AppKey**
4. **创建机器人账号**（而非普通个人账号）并获取 **Account ID** 和 **Token**

## 启动机器人

```bash
openclaw onboard
```

## 使用

### 发送消息

```typescript
import { sendMessageNim, sendImageNim, sendFileNim, sendAudioNim, sendVideoNim } from "@nimsuite/openclaw-nim-channel";

// 发送文本消息
await sendMessageNim({
  cfg: openclawConfig,
  to: "user123",
  text: "Hello from NIM bot!",
});

// 发送图片（支持：.jpg, .jpeg, .png, .gif, .webp, .bmp）
await sendImageNim({
  cfg: openclawConfig,
  to: "user123",
  imagePath: "/path/to/image.png",
});

// 发送视频（支持：.mp4, .mov, .avi, .mkv, .webm, .flv）
await sendVideoNim({
  cfg: openclawConfig,
  to: "user123",
  videoPath: "/path/to/video.mp4",
  duration: 60, // 时长（秒）
  width: 1920,
  height: 1080,
});

// 发送音频（支持：.mp3, .wav, .aac, .m4a, .ogg, .amr）
await sendAudioNim({
  cfg: openclawConfig,
  to: "user123",
  audioPath: "/path/to/audio.mp3",
  duration: 30, // 时长（秒）
});

// 发送文件（任意文件类型）
await sendFileNim({
  cfg: openclawConfig,
  to: "user123",
  filePath: "/path/to/document.pdf",
});
```

### 目标格式

| 格式           | 说明            |
| -------------- | --------------- |
| `user123`      | 纯账号 ID       |
| `nim:user123`  | 带 `nim:` 前缀  |
| `user:user123` | 带 `user:` 前缀 |

## 支持的消息类型

| 类型   | 接收 | 发送 |
| ------ | ---- | ---- |
| 文本   | ✅   | ✅   |
| 图片   | ✅   | ✅   |
| 文件   | ✅   | ✅   |
| 音频   | ✅   | ✅   |
| 视频   | ✅   | ✅   |
| 位置   | ✅   | ❌   |
| 自定义 | ✅   | ❌   |

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test

# 监听模式
npm run dev
```

## 许可证

MIT
