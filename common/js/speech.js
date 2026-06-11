function speakHanzi(hanzi) {
    if (!("speechSynthesis" in window) || !hanzi) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(hanzi);
    utterance.lang = "zh-CN";
    utterance.rate = 0.85;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
}

window.speakHanzi = speakHanzi;
