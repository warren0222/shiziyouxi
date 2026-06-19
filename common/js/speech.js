// 朗读汉字。优先调用 Capacitor TextToSpeech 原生插件（在打包后的 Android App 里可用），
// 其余环境（普通浏览器、未注入 Capacitor 的 WebView）退回到 Web Speech API。
function speakHanzi(hanzi) {
    if (!hanzi) return;

    const native = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.TextToSpeech;
    if (native) {
        // 先停掉前一句，避免快速点击时重叠
        try { native.stop(); } catch (_) {}
        native.speak({
            text: hanzi,
            lang: "zh-CN",
            rate: 0.55,
            pitch: 1.0,
            category: "ambient"
        }).catch(function () {
            // 原生 TTS 失败时退回 Web Speech
            webSpeak(hanzi);
        });
        return;
    }

    webSpeak(hanzi);
}

function webSpeak(hanzi) {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(hanzi);
    utterance.lang = "zh-CN";
    utterance.rate = 0.55;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
}

window.speakHanzi = speakHanzi;
