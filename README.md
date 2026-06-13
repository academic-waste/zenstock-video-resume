# ZenStock Video Resume

一个用于 ZenStockTrade 课程视频的私用 Chrome 扩展：自动记住上次看到的位置，下次打开同一节课时自动恢复。

A small Chrome extension for ZenStockTrade course videos. It remembers where you stopped and resumes from that point the next time you open the same lesson.

Current version: `0.2.2`

## 中文说明

### 功能

- 自动记录 ZenStockTrade 课程视频的播放进度。
- 再次打开同一节课时，自动跳到上次观看位置。
- 弹窗提供两个选择：
  - `Start here`：从恢复的位置继续看。
  - `Start over`：从 `0:00` 重新开始，并重置保存点。
- 支持常见的嵌入式播放器 iframe，例如 Vimeo、Wistia、JWPlayer、VdoCipher、Bunny/Cloudflare Stream、SproutVideo、YouTube。
- 只在 ZenStockTrade 页面或其嵌入的视频 iframe 中工作，不会记录你在其他网站看的视频。
- 播放进度只保存在本地 Chrome 扩展存储里，不上传到任何服务器。

### 安装

1. 下载或 clone 这个仓库。
2. 在 Chrome 地址栏打开 `chrome://extensions`。
3. 打开右上角 `Developer mode`。
4. 点击 `Load unpacked`。
5. 选择这个仓库文件夹。
6. 打开 ZenStockTrade 课程页面并播放视频。

### 更新

如果你更新了代码：

1. 打开 `chrome://extensions`。
2. 找到 `ZenStock Video Resume`。
3. 点击扩展卡片上的 Reload/刷新按钮。
4. 关闭并重新打开 ZenStockTrade 课程页面。

只刷新扩展不一定会移除已经注入到旧页面里的脚本，所以建议重新打开课程页面。

### 使用

播放视频超过几秒后，扩展会自动保存当前进度。下次打开同一课程视频时，会出现类似：

`Resumed at 37:01`

你可以选择：

- `Start here`：接受这个恢复点，继续播放。
- `Start over`：回到 `0:00` 并清掉这个恢复点。
- `X`：只关闭提示，不改变当前播放位置。

### 故障排查

如果视频没有自动恢复，可能是课程使用了另一个没有列入权限的 iframe 播放器域名。可以打开 Chrome DevTools，检查视频外层 iframe 的域名，然后把它加到 `manifest.json` 的 `content_scripts.matches` 里。

如果视频一直回到同一秒，请确认你使用的是 `0.2.2` 或更新版本，并在 `chrome://extensions` 里 Reload 扩展后重新打开课程页。

## English

### Features

- Automatically saves playback progress on ZenStockTrade lesson videos.
- Resumes the same lesson from the saved position the next time you open it.
- Shows two explicit actions after resuming:
  - `Start here`: keep watching from the restored position.
  - `Start over`: jump to `0:00` and reset the saved position.
- Supports common embedded player frames, including Vimeo, Wistia, JWPlayer, VdoCipher, Bunny/Cloudflare Stream, SproutVideo, and YouTube.
- Runs only on ZenStockTrade pages or video frames embedded by ZenStockTrade.
- Stores progress locally in Chrome extension storage. Nothing is uploaded to a server.

### Install

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select this repository folder.
6. Open a ZenStockTrade lesson page and play a video.

### Update

After changing or pulling new code:

1. Open `chrome://extensions`.
2. Find `ZenStock Video Resume`.
3. Click the extension card's Reload button.
4. Close and reopen the ZenStockTrade lesson page.

Reloading the extension alone may not remove scripts that were already injected into an old page, so reopening the lesson tab is recommended.

### Usage

After a video plays for a few seconds, the extension saves its progress automatically. When you reopen the same lesson, you should see a message like:

`Resumed at 37:01`

You can choose:

- `Start here`: accept the restored position and continue watching.
- `Start over`: go back to `0:00` and reset the saved position.
- `X`: dismiss the message without changing the current playback position.

### Troubleshooting

If a video does not resume, the lesson may use an iframe player hosted on a domain that is not listed in the extension permissions. Open Chrome DevTools, inspect the iframe around the video, and add that host to `content_scripts.matches` in `manifest.json`.

If the video keeps jumping back to the same second, make sure you are using version `0.2.2` or newer. Reload the extension in `chrome://extensions`, then close and reopen the lesson page.

## Privacy

This extension saves only local playback progress metadata, such as lesson URL, saved time, duration, and page title. It does not send data to any external server.

本扩展只在本地保存播放进度相关信息，例如课程 URL、保存时间点、视频时长和页面标题。它不会把数据发送到任何外部服务器。
