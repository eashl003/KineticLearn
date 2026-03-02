/* eslint-disable @typescript-eslint/no-explicit-any */

const win = window as any;

export function isSpeechSupported(): boolean {
  return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
}

export function createRecognizer(
  onResult: (transcript: string) => void,
  onEnd: () => void,
): {
  start: () => void;
  stop: () => void;
  abort: () => void;
} {
  const SpeechRecognition =
    win.SpeechRecognition || win.webkitSpeechRecognition;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let finalTranscript = '';

  recognition.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript + ' ';
      } else {
        interim += result[0].transcript;
      }
    }
    onResult(finalTranscript + interim);
  };

  recognition.onend = () => {
    onEnd();
  };

  recognition.onerror = (event: any) => {
    console.error('Speech recognition error:', event.error);
    if (event.error !== 'aborted') {
      onEnd();
    }
  };

  return {
    start: () => {
      finalTranscript = '';
      recognition.start();
    },
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  };
}
