# voice-task-reminder

手機優先的語音行事曆提醒 Web App，使用原生 HTML、CSS、JavaScript 製作。

## 本機啟動

在專案目錄執行：

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

電腦開啟 `http://localhost:4173`。手機與電腦連接同一個 Wi-Fi 後，使用電腦的區域網路 IP 開啟 `http://電腦IP:4173`。

> Web Speech API 的可用性取決於瀏覽器。iPhone 仍可直接使用系統鍵盤上的麥克風，把語音轉成文字後新增任務。
