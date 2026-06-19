# 打包 Android APK 指南

把 `web/` + `common/` 里的纯静态游戏合集，用 [Capacitor](https://capacitorjs.com/) 包成可在手机上侧载安装的 Android APK。本文记录从空环境到拿到 APK 的完整步骤。

> 当前只支持 Android。iOS 需 macOS + Xcode + 苹果开发者账号，本仓库暂未配置。

## 一、构建机环境

| 软件 | 版本 | 安装提示 |
| --- | --- | --- |
| Node.js | ≥ 18 | `apt install nodejs npm` 或 [nvm](https://github.com/nvm-sh/nvm) |
| JDK | 17（AGP 8 需要） | `apt install openjdk-17-jdk` 或 [SDKMAN](https://sdkman.io/) |
| Android SDK | Platform-Tools + Build-Tools 34 + Platform 34 | 见下方 |
| 构建系统 | Gradle（无需手装，工程内带 wrapper） | — |

### 安装 Android SDK（命令行）

```bash
# 下载 cmdline-tools，并放到 $ANDROID_HOME/cmdline-tools/latest/
mkdir -p ~/android-sdk/cmdline-tools && cd ~/android-sdk/cmdline-tools
curl -O https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-*.zip
mv cmdline-tools latest

# 暴露环境变量（建议写进 ~/.bashrc）
export ANDROID_HOME=$HOME/android-sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

# 接受协议、装平台
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## 二、第一次打包

```bash
cd mobile
npm install                    # 安装 Capacitor 与 TTS 插件
npm run sync                   # 把 ../web 和 ../common 同步到 mobile/www/
npx cap add android            # 生成 mobile/android/ Gradle 工程（仅首次）
npx cap sync android           # 把 www/ 与原生插件复制进 android 工程
cd android
./gradlew assembleDebug        # 构建 debug APK
```

构建产物：

```
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

文件大小约 5–10 MB，已用 Android SDK 自带的 debug keystore 签过名，可直接安装。

## 三、增量打包

修改了 `web/` 或 `common/` 里的代码后：

```bash
cd mobile
npm run build:android   # = sync + cap sync + assembleDebug
```

如果改了 `mobile/capacitor.config.json` 或加了新插件，再多跑一遍 `npx cap sync android`。

## 四、安装到手机

任选其一：

- **adb（推荐）**：手机开发者选项里打开 USB 调试，连上数据线后
  ```bash
  adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
  ```
- **直接传文件**：把 APK 拷到手机 → 在文件管理器里点开 → 系统会提示"允许从此来源安装应用"，确认即可。

> Android 11+ 默认不允许安装未知来源的 APK，需要在系统设置里给当前安装器（文件管理器/浏览器）单独打开"允许安装应用"权限。

## 五、调试

```bash
adb logcat | grep -i 'capacitor\|chromium\|shiziyouxi'
```

也可以用 Chrome：手机连接电脑，浏览器访问 `chrome://inspect`，能看到 App 内 WebView 的 DevTools。

## 六、常见问题

- **APK 装上后白屏 / 看不到游戏**：八成是 `mobile/www/` 没同步。重新执行 `npm run sync`，确认 `mobile/www/index.html` 存在且里面所有 `../common/` 都已被改成 `./common/`。
- **点击发音没反应**：
  1. App 应当走 Capacitor TextToSpeech 插件。打开 `chrome://inspect` 在 console 输入 `window.Capacitor?.Plugins?.TextToSpeech` 看是否存在。
  2. 系统侧需要安装中文 TTS 引擎（Google TTS / 讯飞 / 百度等之一）并选好。
  3. 如果都没问题但仍静音，先 `adb logcat | grep -i tts` 看错误。
- **Gradle 第一次构建非常慢**：要从 Google 仓库下 AGP/AndroidX/Kotlin，几百 MB；视网络可能需要 5–20 分钟。失败的话检查代理：`./gradlew --stop && export GRADLE_OPTS="-Dhttp.proxyHost=... -Dhttp.proxyPort=..."`。
- **想换包名/应用名**：编辑 `mobile/capacitor.config.json` 的 `appId`、`appName`，删掉 `mobile/android/` 后重新 `npx cap add android`。

## 七、目录结构

```
mobile/
├── package.json              # npm scripts: sync / build:android
├── capacitor.config.json     # appId, webDir, android 配置
├── scripts/
│   └── sync-www.sh           # 把 ../web + ../common 同步到 www/
├── www/                      # 构建产物，已 gitignore
└── android/                  # `npx cap add android` 生成，已部分 gitignore
```

仅 `package.json`、`capacitor.config.json`、`scripts/`、`.gitignore` 提交版本控制。`www/`、`node_modules/`、`android/build/` 等都被忽略。
